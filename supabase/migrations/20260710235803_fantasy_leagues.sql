create type public.fantasy_season_status as enum ('drafting', 'active', 'complete');

create table public.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  join_code text not null unique check (join_code ~ '^[a-f0-9]{18}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.fantasy_league_members (
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.fantasy_seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  status public.fantasy_season_status not null default 'drafting',
  current_pick integer not null default 1 check (current_pick > 0),
  pick_deadline timestamptz,
  draft_started_at timestamptz not null,
  scoring_starts_at timestamptz,
  scoring_ends_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (league_id, month)
);

create table public.fantasy_draft_order (
  season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  primary key (season_id, user_id),
  unique (season_id, position)
);

create table public.fantasy_preferences (
  season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  rank smallint not null check (rank between 1 and 50),
  primary key (season_id, user_id, snack_id),
  unique (season_id, user_id, rank)
);

create table public.fantasy_picks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  category public.snack_category not null,
  pick_number integer not null check (pick_number > 0),
  round_number smallint not null check (round_number between 1 and 5),
  was_auto_pick boolean not null default false,
  selected_at timestamptz not null,
  unique (season_id, snack_id),
  unique (season_id, pick_number),
  unique (season_id, user_id, category)
);

create table public.fantasy_roster_slots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category public.snack_category not null,
  snack_id uuid not null references public.snacks(id),
  effective_from timestamptz not null,
  effective_to timestamptz,
  check (effective_to is null or effective_to > effective_from)
);
create unique index fantasy_roster_slots_active_category_idx
  on public.fantasy_roster_slots(season_id, user_id, category) where effective_to is null;

create table public.fantasy_waivers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outgoing_snack_id uuid not null references public.snacks(id),
  incoming_snack_id uuid not null references public.snacks(id),
  created_at timestamptz not null,
  unique (season_id, user_id),
  check (outgoing_snack_id <> incoming_snack_id)
);

create index fantasy_league_members_user_idx on public.fantasy_league_members(user_id);
create index fantasy_seasons_state_idx on public.fantasy_seasons(status, pick_deadline, scoring_ends_at);
create index fantasy_draft_order_user_idx on public.fantasy_draft_order(user_id);
create index fantasy_preferences_snack_idx on public.fantasy_preferences(snack_id);
create index fantasy_picks_user_idx on public.fantasy_picks(user_id);
create index fantasy_roster_slots_snack_time_idx on public.fantasy_roster_slots(snack_id, effective_from, effective_to);
create index fantasy_waivers_incoming_idx on public.fantasy_waivers(incoming_snack_id);

insert into public.badge_definitions (key, label, kind)
values ('fantasy-champion', 'Fantasy Champion', 'fantasy')
on conflict (key) do nothing;

create function public.fantasy_is_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and coalesce((select enabled from public.feature_flags where key = 'fantasy_enabled'), false)
$$;

create function public.require_fantasy_enabled()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not coalesce((select enabled from public.feature_flags where key = 'fantasy_enabled'), false) then
    raise exception 'Fantasy is locked for the pilot.';
  end if;
end
$$;

create function public.fantasy_add_business_hours(p_start timestamptz, p_hours integer)
returns timestamptz language plpgsql immutable set search_path = '' as $$
declare
  local_value timestamp := p_start at time zone 'America/New_York';
  remaining interval := make_interval(hours => p_hours);
  available interval;
begin
  if p_hours < 0 then raise exception 'Hours must be non-negative.'; end if;
  loop
    while extract(isodow from local_value) > 5 loop local_value := date_trunc('day', local_value) + interval '1 day 9 hours'; end loop;
    if local_value::time < time '09:00' then local_value := date_trunc('day', local_value) + interval '9 hours'; end if;
    if local_value::time >= time '17:00' then
      local_value := date_trunc('day', local_value) + interval '1 day 9 hours';
      continue;
    end if;
    available := date_trunc('day', local_value) + interval '17 hours' - local_value;
    if remaining <= available then return (local_value + remaining) at time zone 'America/New_York'; end if;
    remaining := remaining - available;
    local_value := date_trunc('day', local_value) + interval '1 day 9 hours';
  end loop;
  return null;
end
$$;

create function public.fantasy_current_picker(p_season_id uuid, p_pick integer)
returns uuid language sql stable security definer set search_path = '' as $$
  with member_count as (
    select count(*)::integer count from public.fantasy_draft_order where season_id = p_season_id
  ), target as (
    select ((p_pick - 1) / count) + 1 as round_number,
      ((p_pick - 1) % count) + 1 as within_round, count
    from member_count where count > 0
  )
  select o.user_id
  from target t
  join public.fantasy_draft_order o on o.season_id = p_season_id
    and o.position = case when t.round_number % 2 = 1 then t.within_round else t.count - t.within_round + 1 end
$$;

create function public.create_fantasy_league(p_name text)
returns table (league_id uuid, join_code text)
language plpgsql security definer set search_path = '' as $$
declare new_league public.fantasy_leagues;
begin
  perform public.require_fantasy_enabled();
  insert into public.fantasy_leagues(name, join_code, created_by)
  values (left(trim(p_name), 80), encode(extensions.gen_random_bytes(9), 'hex'), auth.uid()) returning * into new_league;
  insert into public.fantasy_league_members values (new_league.id, auth.uid(), now());
  return query select new_league.id, new_league.join_code;
end
$$;

create function public.join_fantasy_league(p_join_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  perform public.require_fantasy_enabled();
  select id into target_id from public.fantasy_leagues where join_code = lower(trim(p_join_code)) for update;
  if target_id is null then raise exception 'League not found.'; end if;
  if exists (select 1 from public.fantasy_seasons where league_id = target_id and status in ('drafting','active')) then raise exception 'League entry is closed.'; end if;
  if (select count(*) from public.fantasy_league_members where league_id = target_id) >= 8 then raise exception 'League is full.'; end if;
  insert into public.fantasy_league_members values (target_id, auth.uid(), now()) on conflict do nothing;
  return target_id;
end
$$;

create function public.start_fantasy_draft(p_league_id uuid, p_month date, p_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
declare season_id uuid; member_count integer; eligible_categories integer; first_open timestamptz;
begin
  perform public.require_fantasy_enabled();
  if p_month <> date_trunc('month', p_month)::date then raise exception 'Month must be the first day.'; end if;
  if p_month <> date_trunc('month',public.eastern_date(p_at))::date then raise exception 'Draft month must be current.'; end if;
  if not exists (select 1 from public.fantasy_leagues where id = p_league_id and created_by = auth.uid()) then raise exception 'Only the league creator can start the draft.'; end if;
  select count(*) into member_count from public.fantasy_league_members where league_id = p_league_id;
  if member_count < 4 or member_count > 8 then raise exception 'A league needs four to eight managers.'; end if;
  select count(*) into eligible_categories from (
    select category from public.snacks where merged_into_id is null group by category having count(*) >= member_count limit 5
  ) categories;
  if eligible_categories < 5 then raise exception 'The catalog cannot supply five exclusive roster categories.'; end if;
  first_open := public.eastern_timestamp(p_month, time '09:00');
  if p_at < first_open then raise exception 'The draft has not opened yet.'; end if;
  insert into public.fantasy_seasons(league_id,month,draft_started_at,pick_deadline,scoring_ends_at)
  values (p_league_id,p_month,p_at,public.fantasy_add_business_hours(p_at,3),public.eastern_timestamp((p_month + interval '1 month')::date,time '00:00'))
  returning id into season_id;
  insert into public.fantasy_draft_order(season_id,user_id,position)
  select season_id,m.user_id,row_number() over(order by md5(season_id::text || m.user_id::text))
  from public.fantasy_league_members m where m.league_id=p_league_id;
  return season_id;
end
$$;

create function public.set_fantasy_preferences(p_season_id uuid, p_snack_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_fantasy_enabled();
  if not exists (select 1 from public.fantasy_draft_order where season_id=p_season_id and user_id=auth.uid()) then raise exception 'Not a season manager.'; end if;
  if cardinality(p_snack_ids) > 50 or cardinality(p_snack_ids) <> (select count(distinct value) from unnest(p_snack_ids) value) then raise exception 'Preferences must contain at most 50 unique snacks.'; end if;
  delete from public.fantasy_preferences where season_id=p_season_id and user_id=auth.uid();
  insert into public.fantasy_preferences(season_id,user_id,snack_id,rank)
  select p_season_id,auth.uid(),value,ordinality from unnest(p_snack_ids) with ordinality choices(value,ordinality)
  join public.snacks s on s.id=value and s.merged_into_id is null;
end
$$;

create function public.make_fantasy_pick(p_season_id uuid, p_user_id uuid, p_snack_id uuid, p_auto boolean, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare season_record public.fantasy_seasons; snack_record public.snacks; manager_count integer; total_picks integer;
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
    update public.fantasy_seasons set status='active',current_pick=season_record.current_pick+1,pick_deadline=null,scoring_starts_at=p_at where id=p_season_id;
  else
    update public.fantasy_seasons set current_pick=season_record.current_pick+1,pick_deadline=public.fantasy_add_business_hours(p_at,3) where id=p_season_id;
  end if;
end
$$;

create function public.submit_fantasy_pick(p_season_id uuid, p_snack_id uuid, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz;
begin
  perform public.require_fantasy_enabled();
  select pick_deadline into deadline from public.fantasy_seasons where id=p_season_id;
  if deadline is null or p_at > deadline then raise exception 'The pick clock expired.'; end if;
  perform public.make_fantasy_pick(p_season_id,auth.uid(),p_snack_id,false,p_at);
end
$$;

create function public.auto_pick_fantasy(p_season_id uuid, p_at timestamptz)
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
    left join public.snack_logs l on l.snack_id=s.id and l.logged_at >= p_at-interval '30 days'
    left join public.log_upvotes u on u.log_id=l.id
    where s.merged_into_id is null
      and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.snack_id=s.id)
      and not exists (select 1 from public.fantasy_picks p where p.season_id=p_season_id and p.user_id=picker and p.category=s.category)
    group by s.id order by count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name limit 1;
  end if;
  if choice is null then raise exception 'No eligible auto-pick remains.'; end if;
  perform public.make_fantasy_pick(p_season_id,picker,choice,true,p_at);
end
$$;

create function public.fantasy_standings(p_season_id uuid)
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
    and events.occurred_at<least(coalesce(slot.effective_to,season.scoring_ends_at),season.scoring_ends_at)
  where members.season_id=p_season_id group by members.user_id order by count(events.snack_id) desc,members.user_id
$$;

create function public.submit_fantasy_waiver(p_season_id uuid, p_outgoing_snack_id uuid, p_incoming_snack_id uuid, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare outgoing public.fantasy_roster_slots; incoming_category public.snack_category;
begin
  perform public.require_fantasy_enabled();
  if extract(isodow from public.eastern_date(p_at))<>5 or (p_at at time zone 'America/New_York')::time>=time '17:00' then raise exception 'Waivers are open through Friday at 5:00 PM Eastern.'; end if;
  if not exists (select 1 from public.fantasy_seasons where id=p_season_id and status='active' and p_at<scoring_ends_at) then raise exception 'Season is not active.'; end if;
  if exists (select 1 from public.fantasy_waivers where season_id=p_season_id and user_id=auth.uid()) then raise exception 'Friday waiver already used.'; end if;
  select * into outgoing from public.fantasy_roster_slots where season_id=p_season_id and user_id=auth.uid() and snack_id=p_outgoing_snack_id and effective_to is null for update;
  select category into incoming_category from public.snacks where id=p_incoming_snack_id and merged_into_id is null;
  if outgoing.id is null or incoming_category is null or incoming_category<>outgoing.category then raise exception 'Replacement must preserve the roster category.'; end if;
  if exists (select 1 from public.fantasy_roster_slots where season_id=p_season_id and snack_id=p_incoming_snack_id and effective_to is null) then raise exception 'Snack is already rostered.'; end if;
  update public.fantasy_roster_slots set effective_to=p_at where id=outgoing.id;
  insert into public.fantasy_roster_slots(season_id,user_id,category,snack_id,effective_from) values(p_season_id,auth.uid(),incoming_category,p_incoming_snack_id,p_at);
  insert into public.fantasy_waivers(season_id,user_id,outgoing_snack_id,incoming_snack_id,created_at) values(p_season_id,auth.uid(),p_outgoing_snack_id,p_incoming_snack_id,p_at);
end
$$;

create function public.start_fantasy_draft(p_league_id uuid, p_month date)
returns uuid language sql security definer set search_path = '' as $$
  select public.start_fantasy_draft(p_league_id,p_month,now())
$$;

create function public.submit_fantasy_pick(p_season_id uuid, p_snack_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.submit_fantasy_pick(p_season_id,p_snack_id,now())
$$;

create function public.submit_fantasy_waiver(p_season_id uuid, p_outgoing_snack_id uuid, p_incoming_snack_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.submit_fantasy_waiver(p_season_id,p_outgoing_snack_id,p_incoming_snack_id,now())
$$;

create function public.reconcile_fantasy(p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare season_record public.fantasy_seasons; expired_at timestamptz; top_points bigint; definition_id uuid;
begin
  for season_record in select * from public.fantasy_seasons where status='drafting' and pick_deadline<=p_at for update loop
    while season_record.status='drafting' and season_record.pick_deadline<=p_at loop
      expired_at:=season_record.pick_deadline;
      perform public.auto_pick_fantasy(season_record.id,expired_at);
      select * into season_record from public.fantasy_seasons where id=season_record.id;
    end loop;
  end loop;
  select id into definition_id from public.badge_definitions where key='fantasy-champion';
  for season_record in select * from public.fantasy_seasons where status='active' and scoring_ends_at<=p_at for update loop
    select max(points) into top_points from public.fantasy_standings(season_record.id);
    insert into public.badge_tenures(badge_definition_id,user_id,start_date,end_date)
    select definition_id,user_id,public.eastern_date(season_record.scoring_ends_at),public.eastern_date(season_record.scoring_ends_at)
    from public.fantasy_standings(season_record.id) where points=top_points on conflict do nothing;
    update public.fantasy_seasons set status='complete',completed_at=p_at where id=season_record.id;
  end loop;
end
$$;

create function public.fantasy_feature_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select jsonb_build_object(
    'enabled',coalesce((select enabled from public.feature_flags where key='fantasy_enabled'),false),
    'weeksObserved',least(4,floor(extract(epoch from (now()-coalesce((select min(created_at) from public.profiles),now())))/604800)::integer),
    'dailyActiveUsers',coalesce((select round(avg(active_users),1) from (select count(distinct user_id) active_users from public.snack_logs where logged_at>=now()-interval '28 days' group by logged_on) daily),0),
    'fullBracketParticipation',coalesce((select bool_or(
      exists(select 1 from public.bracket_matchups played where played.week_id=w.id)
      and not exists(select 1 from public.bracket_matchups m where m.week_id=w.id and not exists(select 1 from public.bracket_votes v where v.matchup_id=m.id))
    ) from public.bracket_weeks w),false),
    'weeklyUserGrowth',coalesce((select count(distinct user_id) from public.snack_logs where logged_at>=now()-interval '7 days'),0) > coalesce((select count(distinct user_id) from public.snack_logs where logged_at>=now()-interval '14 days' and logged_at<now()-interval '7 days'),0),
    'averageLogsPerUserWeek',coalesce((select round(count(*)::numeric/nullif(count(distinct user_id),0)/4,1) from public.snack_logs where logged_at>=now()-interval '28 days'),0)
  ) into result;
  return result;
end
$$;

create function public.my_fantasy_leagues()
returns table (league_id uuid, name text, join_code text, member_count bigint, is_creator boolean)
language sql stable security definer set search_path = '' as $$
  select l.id,l.name,l.join_code,(select count(*) from public.fantasy_league_members m2 where m2.league_id=l.id),l.created_by=auth.uid()
  from public.fantasy_leagues l join public.fantasy_league_members m on m.league_id=l.id and m.user_id=auth.uid()
  where public.fantasy_is_enabled() order by l.created_at desc
$$;

create function public.fantasy_overview(p_league_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; current_season_id uuid;
begin
  perform public.require_fantasy_enabled();
  if not exists(select 1 from public.fantasy_league_members where league_id=p_league_id and user_id=auth.uid()) then raise exception 'Not a league member.'; end if;
  select id into current_season_id from public.fantasy_seasons where league_id=p_league_id order by month desc limit 1;
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

alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_league_members enable row level security;
alter table public.fantasy_seasons enable row level security;
alter table public.fantasy_draft_order enable row level security;
alter table public.fantasy_preferences enable row level security;
alter table public.fantasy_picks enable row level security;
alter table public.fantasy_roster_slots enable row level security;
alter table public.fantasy_waivers enable row level security;

revoke all on public.fantasy_leagues,public.fantasy_league_members,public.fantasy_seasons,public.fantasy_draft_order,
  public.fantasy_preferences,public.fantasy_picks,public.fantasy_roster_slots,public.fantasy_waivers from anon,authenticated;

revoke execute on function public.fantasy_is_enabled() from public,anon;
revoke execute on function public.fantasy_feature_state() from public,anon;
revoke execute on function public.my_fantasy_leagues() from public,anon;
revoke execute on function public.fantasy_overview(uuid) from public,anon;
revoke execute on function public.create_fantasy_league(text) from public,anon;
revoke execute on function public.join_fantasy_league(text) from public,anon;
revoke execute on function public.start_fantasy_draft(uuid,date,timestamptz) from public,anon;
revoke execute on function public.set_fantasy_preferences(uuid,uuid[]) from public,anon;
revoke execute on function public.submit_fantasy_pick(uuid,uuid,timestamptz) from public,anon;
revoke execute on function public.submit_fantasy_waiver(uuid,uuid,uuid,timestamptz) from public,anon;
revoke execute on function public.start_fantasy_draft(uuid,date,timestamptz),public.submit_fantasy_pick(uuid,uuid,timestamptz),public.submit_fantasy_waiver(uuid,uuid,uuid,timestamptz) from authenticated;
revoke execute on function public.start_fantasy_draft(uuid,date),public.submit_fantasy_pick(uuid,uuid),public.submit_fantasy_waiver(uuid,uuid,uuid) from public,anon;
grant execute on function public.fantasy_is_enabled(),public.fantasy_feature_state(),public.my_fantasy_leagues(),public.fantasy_overview(uuid),
  public.create_fantasy_league(text),public.join_fantasy_league(text),public.start_fantasy_draft(uuid,date),
  public.set_fantasy_preferences(uuid,uuid[]),public.submit_fantasy_pick(uuid,uuid),public.submit_fantasy_waiver(uuid,uuid,uuid) to authenticated;

revoke execute on function public.require_fantasy_enabled(),public.fantasy_add_business_hours(timestamptz,integer),
  public.fantasy_current_picker(uuid,integer),public.make_fantasy_pick(uuid,uuid,uuid,boolean,timestamptz),
  public.auto_pick_fantasy(uuid,timestamptz),public.fantasy_standings(uuid),public.reconcile_fantasy(timestamptz) from public,anon,authenticated;

create function public.reconcile_snack_squad(p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.reconcile_competitions(p_at);
  perform public.reconcile_fantasy(p_at);
end
$$;
revoke execute on function public.reconcile_snack_squad(timestamptz) from public,anon,authenticated;

do $$ declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='snack-squad-competition-reconciler';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('snack-squad-competition-reconciler','*/5 * * * *','select public.reconcile_snack_squad()');
end $$;
