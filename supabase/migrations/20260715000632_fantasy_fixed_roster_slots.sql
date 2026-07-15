create function public.fantasy_roster_category(p_category public.snack_category)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case p_category
    when 'Grains/Bakery' then 'Grains/Bakery'
    when 'Fruit' then 'Fruit'
    when 'Vegetables' then 'Vegetable'
    when 'Candy/Sweets' then 'Candy/Chips'
    when 'Chips/Savory Snacks' then 'Candy/Chips'
    when 'Protein' then 'Protein'
  end
$$;

with ranked_slots as (
  select slot.id,
    row_number() over (
      partition by slot.season_id, slot.user_id, public.fantasy_roster_category(slot.category)
      order by slot.effective_from, slot.id
    ) as slot_number
  from public.fantasy_roster_slots slot
  join public.fantasy_seasons season on season.id = slot.season_id
  where season.status = 'drafting'
    and slot.effective_to is null
    and public.fantasy_roster_category(slot.category) is not null
), retired_slots as (
  select id from ranked_slots where slot_number > 1
  union
  select slot.id
  from public.fantasy_roster_slots slot
  join public.fantasy_seasons season on season.id = slot.season_id
  where season.status = 'drafting'
    and slot.effective_to is null
    and public.fantasy_roster_category(slot.category) is null
)
update public.fantasy_roster_slots slot
set effective_to = greatest(now(), slot.effective_from + interval '1 microsecond')
from retired_slots retired
where slot.id = retired.id;

drop index public.fantasy_roster_slots_active_category_idx;
create unique index fantasy_roster_slots_active_category_idx
  on public.fantasy_roster_slots(
    season_id,
    user_id,
    (public.fantasy_roster_category(category))
  )
  where effective_to is null
    and public.fantasy_roster_category(category) is not null;

alter table public.fantasy_picks
  drop constraint fantasy_picks_round_number_check,
  add constraint fantasy_picks_round_number_check check (round_number > 0);

insert into public.fantasy_fallback_products(name, normalized_name, category)
select 'Candy/Sweets Reserve ' || n, 'candy/sweets reserve ' || n, 'Candy/Sweets'::public.snack_category
from generate_series(1, 8) n
on conflict (name) do nothing;

create or replace function public.set_fantasy_preferences(p_season_id uuid, p_snack_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_fantasy_enabled();
  if not exists (select 1 from public.fantasy_draft_order where season_id=p_season_id and user_id=auth.uid()) then raise exception 'Not a season manager.'; end if;
  if cardinality(p_snack_ids) > 50 or cardinality(p_snack_ids) <> (select count(distinct value) from unnest(p_snack_ids) value) then raise exception 'Preferences must contain at most 50 unique snacks.'; end if;
  delete from public.fantasy_preferences where season_id=p_season_id and user_id=auth.uid();
  insert into public.fantasy_preferences(season_id,user_id,snack_id,rank)
  select p_season_id,auth.uid(),value,ordinality from unnest(p_snack_ids) with ordinality choices(value,ordinality)
  join public.snacks s on s.id=value
    and s.merged_into_id is null
    and public.fantasy_roster_category(s.category) is not null;
end
$$;

create or replace function public.make_fantasy_pick(p_season_id uuid, p_user_id uuid, p_snack_id uuid, p_auto boolean, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  season_record public.fantasy_seasons;
  snack_record public.snacks;
  roster_category text;
  scoring_start timestamptz;
begin
  select * into season_record from public.fantasy_seasons where id=p_season_id for update;
  if season_record.status <> 'drafting' then raise exception 'Draft is not active.'; end if;
  if public.fantasy_current_picker(p_season_id,season_record.current_pick) <> p_user_id then raise exception 'It is not this manager''s pick.'; end if;
  select * into snack_record from public.snacks where id=p_snack_id and merged_into_id is null;
  if snack_record.id is null then raise exception 'Snack not found.'; end if;
  roster_category := public.fantasy_roster_category(snack_record.category);
  if roster_category is null then raise exception 'Fantasy teams use only Grains/Bakery, Fruit, Vegetable, Candy/Chips, and Protein.'; end if;
  if exists (select 1 from public.fantasy_picks where season_id=p_season_id and snack_id=p_snack_id) then raise exception 'Snack is already drafted.'; end if;
  if exists (
    select 1 from public.fantasy_roster_slots slot
    where slot.season_id=p_season_id and slot.user_id=p_user_id and slot.effective_to is null
      and public.fantasy_roster_category(slot.category)=roster_category
  ) then raise exception 'That roster category is already filled.'; end if;
  insert into public.fantasy_picks(season_id,user_id,snack_id,category,pick_number,round_number,was_auto_pick,selected_at)
  values (p_season_id,p_user_id,p_snack_id,snack_record.category,season_record.current_pick,
    ((season_record.current_pick-1)/(select count(*) from public.fantasy_draft_order where season_id=p_season_id)+1)::smallint,p_auto,p_at);
  insert into public.fantasy_roster_slots(season_id,user_id,category,snack_id,effective_from)
  values (p_season_id,p_user_id,snack_record.category,p_snack_id,p_at);
  if not exists (
    select 1
    from public.fantasy_draft_order manager
    where manager.season_id=p_season_id
      and (
        select count(*)
        from public.fantasy_roster_slots slot
        where slot.season_id=p_season_id and slot.user_id=manager.user_id and slot.effective_to is null
          and public.fantasy_roster_category(slot.category) is not null
      ) < 5
  ) then
    scoring_start := public.fantasy_next_monday(p_at);
    update public.fantasy_seasons set status='active',current_pick=season_record.current_pick+1,pick_deadline=null,
      scoring_starts_at=scoring_start,scoring_ends_at=scoring_start+interval '12 days' where id=p_season_id;
  else
    update public.fantasy_seasons set current_pick=season_record.current_pick+1,
      pick_deadline=public.fantasy_add_business_hours(p_at,3) where id=p_season_id;
  end if;
end
$$;

create or replace function public.materialize_fantasy_fallback(p_season_id uuid, p_user_id uuid, p_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  fallback public.fantasy_fallback_products;
  new_snack_id uuid;
  creator_id uuid;
begin
  select reserve.* into fallback
  from public.fantasy_fallback_products reserve
  where reserve.materialized_snack_id is null
    and public.fantasy_roster_category(reserve.category) is not null
    and not exists (
      select 1 from public.fantasy_roster_slots slot
      where slot.season_id=p_season_id and slot.user_id=p_user_id and slot.effective_to is null
        and public.fantasy_roster_category(slot.category)=public.fantasy_roster_category(reserve.category)
    )
  order by reserve.category,reserve.id for update skip locked limit 1;
  if fallback.id is null then return null; end if;
  select league.created_by into creator_id
  from public.fantasy_seasons season join public.fantasy_leagues league on league.id=season.league_id
  where season.id=p_season_id;
  insert into public.snacks(name,normalized_name,category,source_type,created_by,created_at,updated_at)
  values(fallback.name,fallback.normalized_name,fallback.category,'manual',creator_id,p_at,p_at)
  returning id into new_snack_id;
  update public.fantasy_fallback_products set materialized_snack_id=new_snack_id,materialized_at=p_at where id=fallback.id;
  return new_snack_id;
end
$$;

create or replace function public.auto_pick_fantasy(p_season_id uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare picker uuid; choice uuid;
begin
  picker := public.fantasy_current_picker(p_season_id,(select current_pick from public.fantasy_seasons where id=p_season_id));
  select pref.snack_id into choice
  from public.fantasy_preferences pref join public.snacks s on s.id=pref.snack_id
  where pref.season_id=p_season_id and pref.user_id=picker and s.merged_into_id is null
    and public.fantasy_roster_category(s.category) is not null
    and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.snack_id=s.id)
    and not exists (
      select 1 from public.fantasy_roster_slots slot
      where slot.season_id=p_season_id and slot.user_id=picker and slot.effective_to is null
        and public.fantasy_roster_category(slot.category)=public.fantasy_roster_category(s.category)
    )
  order by pref.rank limit 1;
  if choice is null then
    select s.id into choice from public.snacks s
    left join public.snack_logs l on l.snack_id=s.id and l.logged_at>=p_at-interval '30 days'
    left join public.log_upvotes u on u.log_id=l.id
    where s.merged_into_id is null
      and public.fantasy_roster_category(s.category) is not null
      and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.snack_id=s.id)
      and not exists (
        select 1 from public.fantasy_roster_slots slot
        where slot.season_id=p_season_id and slot.user_id=picker and slot.effective_to is null
          and public.fantasy_roster_category(slot.category)=public.fantasy_roster_category(s.category)
      )
    group by s.id order by count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name limit 1;
  end if;
  if choice is null then choice:=public.materialize_fantasy_fallback(p_season_id,picker,p_at); end if;
  if choice is null then raise exception 'No eligible auto-pick remains.'; end if;
  perform public.make_fantasy_pick(p_season_id,picker,choice,true,p_at);
end
$$;

revoke execute on function public.fantasy_roster_category(public.snack_category) from public,anon,authenticated;
