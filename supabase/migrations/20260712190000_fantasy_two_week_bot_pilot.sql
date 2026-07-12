do $$
begin
  if exists (select 1 from public.fantasy_leagues)
    or exists (select 1 from public.fantasy_seasons)
    or exists (select 1 from public.fantasy_picks) then
    raise exception 'Fantasy two-week migration stopped: existing Fantasy data must be reviewed first.';
  end if;
end
$$;

drop function if exists public.submit_fantasy_waiver(uuid,uuid,uuid,timestamptz);
drop function if exists public.submit_fantasy_waiver(uuid,uuid,uuid);
drop table public.fantasy_waivers;

drop function if exists public.start_fantasy_draft(uuid,date,timestamptz);
drop function if exists public.start_fantasy_draft(uuid,date);

alter table public.fantasy_seasons drop constraint fantasy_seasons_league_id_month_key;
alter table public.fantasy_seasons drop column month;
alter table public.fantasy_seasons add column season_number integer;
alter table public.fantasy_seasons alter column scoring_ends_at drop not null;
alter table public.fantasy_seasons
  add constraint fantasy_seasons_league_number_key unique (league_id, season_number),
  add constraint fantasy_seasons_number_positive check (season_number > 0);
create unique index fantasy_seasons_one_open_idx
  on public.fantasy_seasons(league_id) where status in ('drafting','active');

create table public.fantasy_fallback_products (
  id bigint generated always as identity primary key,
  name text not null unique,
  normalized_name text not null unique,
  category public.snack_category not null,
  materialized_snack_id uuid unique references public.snacks(id),
  materialized_at timestamptz
);

insert into public.fantasy_fallback_products(name,normalized_name,category)
select category || ' Reserve ' || n, lower(category || ' reserve ' || n), category::public.snack_category
from unnest(array['Grains/Bakery','Protein','Dairy','Fruit','Vegetables']) category
cross join generate_series(1,8) n;

alter table public.fantasy_fallback_products enable row level security;
revoke all on public.fantasy_fallback_products from public,anon,authenticated;

create function public.fantasy_next_monday(p_at timestamptz)
returns timestamptz language sql immutable set search_path = '' as $$
  select public.eastern_timestamp(
    public.eastern_date(p_at) + (8 - extract(isodow from public.eastern_date(p_at))::integer),
    time '00:00'
  )
$$;

create function public.start_fantasy_draft(p_league_id uuid, p_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_season_id uuid;
  member_count integer;
  next_number integer;
begin
  perform public.require_fantasy_enabled();
  perform 1 from public.fantasy_leagues where id=p_league_id for update;
  if not exists (select 1 from public.fantasy_leagues where id=p_league_id and created_by=auth.uid()) then
    raise exception 'Only the league creator can start the draft.';
  end if;
  if exists (select 1 from public.fantasy_seasons where league_id=p_league_id and status in ('drafting','active')) then
    raise exception 'The current season must complete before another can start.';
  end if;
  select count(*) into member_count from public.fantasy_league_members where league_id=p_league_id;
  if member_count < 4 or member_count > 8 then raise exception 'A league needs four to eight managers.'; end if;
  select coalesce(max(season_number),0)+1 into next_number from public.fantasy_seasons where league_id=p_league_id;
  insert into public.fantasy_seasons(league_id,season_number,draft_started_at,pick_deadline,scoring_starts_at,scoring_ends_at)
  values (p_league_id,next_number,p_at,public.fantasy_add_business_hours(p_at,3),null,null)
  returning id into new_season_id;
  insert into public.fantasy_draft_order(season_id,user_id,position)
  select new_season_id,m.user_id,row_number() over(order by md5(new_season_id::text || m.user_id::text))
  from public.fantasy_league_members m where m.league_id=p_league_id;
  return new_season_id;
end
$$;

create function public.start_fantasy_draft(p_league_id uuid)
returns uuid language sql security definer set search_path = '' as $$
  select public.start_fantasy_draft(p_league_id,now())
$$;

create or replace function public.make_fantasy_pick(p_season_id uuid, p_user_id uuid, p_snack_id uuid, p_auto boolean, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  season_record public.fantasy_seasons;
  snack_record public.snacks;
  manager_count integer;
  total_picks integer;
  scoring_start timestamptz;
begin
  select * into season_record from public.fantasy_seasons where id=p_season_id for update;
  if season_record.status <> 'drafting' then raise exception 'Draft is not active.'; end if;
  if public.fantasy_current_picker(p_season_id,season_record.current_pick) <> p_user_id then raise exception 'It is not this manager''s pick.'; end if;
  select * into snack_record from public.snacks where id=p_snack_id and merged_into_id is null;
  if snack_record.id is null then raise exception 'Snack not found.'; end if;
  if exists (select 1 from public.fantasy_picks where season_id=p_season_id and snack_id=p_snack_id) then raise exception 'Snack is already drafted.'; end if;
  if exists (select 1 from public.fantasy_picks where season_id=p_season_id and user_id=p_user_id and category=snack_record.category) then raise exception 'Choose a new roster category.'; end if;
  insert into public.fantasy_picks(season_id,user_id,snack_id,category,pick_number,round_number,was_auto_pick,selected_at)
  values (p_season_id,p_user_id,p_snack_id,snack_record.category,season_record.current_pick,
    ((season_record.current_pick-1)/(select count(*) from public.fantasy_draft_order where season_id=p_season_id)+1)::smallint,p_auto,p_at);
  insert into public.fantasy_roster_slots(season_id,user_id,category,snack_id,effective_from)
  values (p_season_id,p_user_id,snack_record.category,p_snack_id,p_at);
  select count(*) into manager_count from public.fantasy_draft_order where season_id=p_season_id;
  total_picks := manager_count * 5;
  if season_record.current_pick >= total_picks then
    scoring_start := public.fantasy_next_monday(p_at);
    update public.fantasy_seasons set status='active',current_pick=season_record.current_pick+1,pick_deadline=null,
      scoring_starts_at=scoring_start,scoring_ends_at=scoring_start+interval '12 days' where id=p_season_id;
  else
    update public.fantasy_seasons set current_pick=season_record.current_pick+1,
      pick_deadline=public.fantasy_add_business_hours(p_at,3) where id=p_season_id;
  end if;
end
$$;

create function public.materialize_fantasy_fallback(p_season_id uuid, p_user_id uuid, p_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  fallback public.fantasy_fallback_products;
  new_snack_id uuid;
  creator_id uuid;
begin
  select reserve.* into fallback
  from public.fantasy_fallback_products reserve
  where reserve.materialized_snack_id is null
    and not exists (
      select 1 from public.fantasy_picks picked
      where picked.season_id=p_season_id and picked.user_id=p_user_id and picked.category=reserve.category
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
    and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.snack_id=s.id)
    and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.user_id=picker and p.category=s.category)
  order by pref.rank limit 1;
  if choice is null then
    select s.id into choice from public.snacks s
    left join public.snack_logs l on l.snack_id=s.id and l.logged_at>=p_at-interval '30 days'
    left join public.log_upvotes u on u.log_id=l.id
    where s.merged_into_id is null
      and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.snack_id=s.id)
      and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.user_id=picker and p.category=s.category)
    group by s.id order by count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name limit 1;
  end if;
  if choice is null then choice:=public.materialize_fantasy_fallback(p_season_id,picker,p_at); end if;
  if choice is null then raise exception 'No eligible auto-pick remains.'; end if;
  perform public.make_fantasy_pick(p_season_id,picker,choice,true,p_at);
end
$$;

create or replace function public.fantasy_standings(p_season_id uuid)
returns table (user_id uuid, points bigint)
language sql stable security definer set search_path = '' as $$
  with season as (select * from public.fantasy_seasons where id=p_season_id), events as (
    select l.user_id actor_id,l.snack_id,l.logged_at occurred_at from public.snack_logs l
    union all
    select u.user_id,l.snack_id,u.created_at from public.log_upvotes u join public.snack_logs l on l.id=u.log_id
  )
  select members.user_id,count(events.snack_id)::bigint
  from public.fantasy_draft_order members join season on true
  left join public.fantasy_roster_slots slot on slot.season_id=season.id and slot.user_id=members.user_id
  left join events on events.snack_id=slot.snack_id and events.actor_id<>members.user_id
    and events.occurred_at>=greatest(slot.effective_from,season.scoring_starts_at)
    and events.occurred_at<season.scoring_ends_at
    and extract(isodow from events.occurred_at at time zone 'America/New_York') between 1 and 5
  where members.season_id=p_season_id group by members.user_id order by count(events.snack_id) desc,members.user_id
$$;

create or replace function public.fantasy_overview(p_league_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; current_season_id uuid;
begin
  perform public.require_fantasy_enabled();
  if not exists(select 1 from public.fantasy_league_members where league_id=p_league_id and user_id=auth.uid()) then raise exception 'Not a league member.'; end if;
  select id into current_season_id from public.fantasy_seasons where league_id=p_league_id order by season_number desc limit 1;
  select jsonb_build_object(
    'league',to_jsonb(l),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'joined_at',m.joined_at) order by m.joined_at) from public.fantasy_league_members m join public.profiles p on p.user_id=m.user_id where m.league_id=l.id),'[]'::jsonb),
    'season',(select to_jsonb(s) from public.fantasy_seasons s where s.id=current_season_id),
    'draftOrder',coalesce((select jsonb_agg(to_jsonb(o) order by o.position) from public.fantasy_draft_order o where o.season_id=current_season_id),'[]'::jsonb),
    'picks',coalesce((select jsonb_agg(to_jsonb(pick)||jsonb_build_object('snack_name',s.name) order by pick.pick_number) from public.fantasy_picks pick join public.snacks s on s.id=pick.snack_id where pick.season_id=current_season_id),'[]'::jsonb),
    'roster',coalesce((select jsonb_agg(to_jsonb(slot)||jsonb_build_object('snack_name',s.name) order by slot.user_id,slot.category) from public.fantasy_roster_slots slot join public.snacks s on s.id=slot.snack_id where slot.season_id=current_season_id and slot.effective_to is null),'[]'::jsonb),
    'standings',coalesce((select jsonb_agg(to_jsonb(score) order by score.points desc) from public.fantasy_standings(current_season_id) score),'[]'::jsonb)
  ) into result from public.fantasy_leagues l where l.id=p_league_id;
  return result;
end
$$;

revoke execute on function public.start_fantasy_draft(uuid,timestamptz) from public,anon,authenticated;
revoke execute on function public.start_fantasy_draft(uuid) from public,anon;
grant execute on function public.start_fantasy_draft(uuid) to authenticated;
revoke execute on function public.fantasy_next_monday(timestamptz),public.materialize_fantasy_fallback(uuid,uuid,timestamptz)
  from public,anon,authenticated;

update public.feature_flags set enabled=true,updated_at=now() where key='fantasy_enabled';

create or replace function public.merge_snacks(p_survivor_id uuid,p_duplicate_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare duplicate_log record; survivor_log_id uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_survivor_id=p_duplicate_id then raise exception 'A snack cannot be merged into itself.'; end if;
  if not exists(select 1 from public.snacks where id=p_survivor_id and merged_into_id is null for update) then raise exception 'Surviving snack not found.'; end if;
  if not exists(select 1 from public.snacks where id=p_duplicate_id and merged_into_id is null for update) then raise exception 'Duplicate snack not found.'; end if;
  -- ponytail: competition history stays immutable; add a historical merge only if moderators need it.
  if exists(select 1 from public.bracket_entries where snack_id in (p_survivor_id,p_duplicate_id))
    or exists(select 1 from public.fantasy_preferences where snack_id in (p_survivor_id,p_duplicate_id))
    or exists(select 1 from public.fantasy_picks where snack_id in (p_survivor_id,p_duplicate_id))
    or exists(select 1 from public.fantasy_roster_slots where snack_id in (p_survivor_id,p_duplicate_id)) then
    raise exception 'Snack is used by competition history and cannot be merged.';
  end if;
  perform set_config('snack_squad.merge_mode','on',true);
  for duplicate_log in select id,user_id,logged_on from public.snack_logs where snack_id=p_duplicate_id order by created_at,id loop
    select id into survivor_log_id from public.snack_logs where snack_id=p_survivor_id and user_id=duplicate_log.user_id and logged_on=duplicate_log.logged_on;
    if survivor_log_id is not null then
      insert into public.log_upvotes(log_id,user_id,created_at)
      select survivor_log_id,user_id,created_at from public.log_upvotes where log_id=duplicate_log.id
      on conflict(log_id,user_id) do nothing;
      delete from public.snack_logs where id=duplicate_log.id;
    end if;
    survivor_log_id:=null;
  end loop;
  update public.snack_logs set snack_id=p_survivor_id where snack_id=p_duplicate_id;
  update public.profiles set favorite_snack_id=p_survivor_id where favorite_snack_id=p_duplicate_id;
  update public.snack_corrections set snack_id=p_survivor_id where snack_id=p_duplicate_id;
  update public.snacks set merged_into_id=p_survivor_id where id=p_duplicate_id;
  perform set_config('snack_squad.merge_mode','off',true);
end
$$;
