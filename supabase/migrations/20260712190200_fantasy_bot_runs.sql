create table public.fantasy_test_runs (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (label ~ '^[a-z0-9-]{3,60}$'),
  status text not null default 'provisioning' check (status in ('provisioning','running','complete','cleanup_ready')),
  pick_clock interval not null default interval '2 minutes' check (pick_clock between interval '1 minute' and interval '30 minutes'),
  reminder_before interval not null default interval '1 minute' check (reminder_before > interval '0' and reminder_before < pick_clock),
  scoring_window interval not null default interval '10 minutes' check (scoring_window between interval '1 minute' and interval '1 day'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.fantasy_test_actors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  run_id uuid not null references public.fantasy_test_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (run_id,user_id)
);
alter table public.fantasy_leagues add column test_run_id uuid references public.fantasy_test_runs(id) on delete restrict;
create unique index fantasy_leagues_test_run_idx on public.fantasy_leagues(test_run_id) where test_run_id is not null;

alter table public.fantasy_test_runs enable row level security;
alter table public.fantasy_test_actors enable row level security;
revoke all on public.fantasy_test_runs,public.fantasy_test_actors from public,anon,authenticated;

create or replace function public.before_user_created_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  user_email text:=lower(trim(event->'user'->>'email'));
  is_test_bot boolean:=coalesce(event->'user'->'app_metadata'->>'snack_squad_test_bot','false')='true';
begin
  if not is_test_bot and (user_email is null or user_email !~ '^[^@]+@carnegiehighered[.]com$') then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Only @carnegiehighered.com email addresses can join Snack Squad.'));
  end if;
  return '{}'::jsonb;
end
$$;

create function public.is_fantasy_test_actor(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.fantasy_test_actors where user_id=p_user_id)
$$;

create function public.create_fantasy_test_run(p_label text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare run_id uuid;
begin
  insert into public.fantasy_test_runs(label) values(lower(trim(p_label))) returning id into run_id;
  return run_id;
end
$$;

create function public.register_fantasy_test_actor(p_run_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select raw_app_meta_data->>'snack_squad_test_bot'='true' from auth.users where id=p_user_id),false) then
    raise exception 'Auth user is not marked as a Fantasy test bot.';
  end if;
  insert into public.fantasy_test_actors(run_id,user_id) values(p_run_id,p_user_id);
end
$$;

create function public.link_fantasy_test_league(p_run_id uuid,p_league_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.fantasy_test_actors where run_id=p_run_id)<>4 then raise exception 'A bot run requires exactly four actors.'; end if;
  if exists (
    select 1 from public.fantasy_league_members member
    where member.league_id=p_league_id and not exists (
      select 1 from public.fantasy_test_actors actor where actor.run_id=p_run_id and actor.user_id=member.user_id
    )
  ) then raise exception 'Test league contains a non-test member.'; end if;
  update public.fantasy_leagues set test_run_id=p_run_id where id=p_league_id and test_run_id is null;
  if not found then raise exception 'Test league could not be linked.'; end if;
  update public.fantasy_test_runs set status='running' where id=p_run_id;
end
$$;

create function public.inspect_fantasy_test_run(p_run_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',run.id,'label',run.label,'status',run.status,
    'actorCount',(select count(*) from public.fantasy_test_actors where run_id=run.id),
    'leagueId',(select id from public.fantasy_leagues where test_run_id=run.id),
    'season',(select to_jsonb(season) from public.fantasy_seasons season join public.fantasy_leagues league on league.id=season.league_id where league.test_run_id=run.id order by season.season_number desc limit 1),
    'notificationCounts',(select coalesce(jsonb_object_agg(status,count),'{}'::jsonb) from (select notification.status,count(*) from public.fantasy_notifications notification join public.fantasy_seasons season on season.id=notification.season_id join public.fantasy_leagues league on league.id=season.league_id where league.test_run_id=run.id group by notification.status) counts)
  ) from public.fantasy_test_runs run where run.id=p_run_id
$$;

create function public.prepare_fantasy_test_snack(p_run_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare season_id uuid;
begin
  if not exists(select 1 from public.fantasy_test_actors where run_id=p_run_id and user_id=p_user_id) then raise exception 'User is not part of this test run.'; end if;
  select season.id into season_id from public.fantasy_seasons season join public.fantasy_leagues league on league.id=season.league_id
  where league.test_run_id=p_run_id and season.status='drafting';
  if season_id is null then raise exception 'Test draft is not active.'; end if;
  return public.materialize_fantasy_fallback(season_id,p_user_id,now());
end
$$;

create function public.advance_fantasy_test_draft(p_run_id uuid,p_count integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare season public.fantasy_seasons;
begin
  if p_count<1 or p_count>40 then raise exception 'Pick count must be between 1 and 40.'; end if;
  for n in 1..p_count loop
    select season_row.* into season from public.fantasy_seasons season_row join public.fantasy_leagues league on league.id=season_row.league_id
    where league.test_run_id=p_run_id order by season_row.season_number desc limit 1;
    exit when season.status<>'drafting';
    perform public.auto_pick_fantasy(season.id,season.pick_deadline);
  end loop;
end
$$;

create function public.complete_fantasy_test_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare season public.fantasy_seasons;
begin
  select season_row.* into season from public.fantasy_seasons season_row join public.fantasy_leagues league on league.id=season_row.league_id
  where league.test_run_id=p_run_id order by season_row.season_number desc limit 1;
  if season.status<>'active' then raise exception 'Test season is not scoring.'; end if;
  perform public.reconcile_fantasy(season.scoring_ends_at);
  update public.fantasy_test_runs set status='complete',completed_at=season.scoring_ends_at where id=p_run_id;
end
$$;

create function public.fantasy_test_cleanup_targets(p_run_id uuid)
returns table(user_id uuid) language sql stable security definer set search_path = '' as $$
  select actor.user_id from public.fantasy_test_actors actor where actor.run_id=p_run_id order by actor.user_id
$$;

create function public.abort_fantasy_test_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.fantasy_leagues where test_run_id=p_run_id) then raise exception 'A linked test league must use guarded cleanup.'; end if;
  if exists(select 1 from public.fantasy_test_actors where run_id=p_run_id) then raise exception 'Delete provisioned Auth bots before aborting the run.'; end if;
  delete from public.fantasy_test_runs where id=p_run_id and status='provisioning';
  if not found then raise exception 'Provisioning run not found.'; end if;
end
$$;

create function public.purge_fantasy_test_data(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_ids uuid[]; target_league_id uuid;
begin
  if exists(select 1 from public.fantasy_test_runs where id=p_run_id and status='cleanup_ready') then return; end if;
  select array_agg(user_id) into actor_ids from public.fantasy_test_actors where run_id=p_run_id;
  select id into target_league_id from public.fantasy_leagues where test_run_id=p_run_id;
  if cardinality(actor_ids)<>4 then raise exception 'Cleanup requires exactly four retained test actors.'; end if;
  if exists(select 1 from public.fantasy_league_members where fantasy_league_members.league_id=target_league_id and not(user_id=any(actor_ids))) then raise exception 'Cleanup blocked by a non-test league member.'; end if;
  if exists(select 1 from public.snack_logs where user_id<>all(actor_ids) and snack_id in (select id from public.snacks where created_by=any(actor_ids))) then raise exception 'Cleanup blocked by non-test activity on a bot-created snack.'; end if;
  delete from public.log_upvotes where user_id=any(actor_ids) or log_id in (select id from public.snack_logs where user_id=any(actor_ids));
  delete from public.snack_logs where user_id=any(actor_ids);
  delete from public.badge_tenures where user_id=any(actor_ids);
  delete from public.fantasy_leagues where id=target_league_id;
  update public.profiles set favorite_snack_id=null where favorite_snack_id in (select id from public.snacks where created_by=any(actor_ids));
  update public.fantasy_fallback_products set materialized_snack_id=null,materialized_at=null where materialized_snack_id in (select id from public.snacks where created_by=any(actor_ids));
  delete from public.snacks where created_by=any(actor_ids);
  update public.fantasy_test_runs set status='cleanup_ready' where id=p_run_id;
end
$$;

create function public.finalize_fantasy_test_cleanup(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.fantasy_test_actors where run_id=p_run_id) then raise exception 'Auth bot users must be deleted before cleanup can finalize.'; end if;
  delete from public.fantasy_test_runs where id=p_run_id and status='cleanup_ready';
  if not found then raise exception 'Test run is not ready for cleanup.'; end if;
end
$$;

create function public.apply_fantasy_test_timing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare run public.fantasy_test_runs; transition_at timestamptz;
begin
  select test_run.* into run from public.fantasy_test_runs test_run
  join public.fantasy_leagues league on league.test_run_id=test_run.id where league.id=new.league_id;
  if run.id is null then return new; end if;
  transition_at:=coalesce((select max(selected_at) from public.fantasy_picks where season_id=new.id),new.draft_started_at);
  if new.status='drafting' and new.pick_deadline is not null then new.pick_deadline:=transition_at+run.pick_clock; end if;
  if new.status='active' then new.scoring_starts_at:=transition_at; new.scoring_ends_at:=transition_at+run.scoring_window; end if;
  return new;
end
$$;
create trigger apply_fantasy_test_timing
before insert or update of pick_deadline,status on public.fantasy_seasons
for each row execute function public.apply_fantasy_test_timing();

create or replace function public.queue_fantasy_turn_notifications(p_season_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  season_record public.fantasy_seasons; picker_id uuid; picker_email text; target_email text;
  started_at timestamptz; reminder interval:=interval '30 minutes'; run_label text;
begin
  select * into season_record from public.fantasy_seasons where id=p_season_id;
  if season_record.status<>'drafting' or season_record.pick_deadline is null then return; end if;
  picker_id:=public.fantasy_current_picker(p_season_id,season_record.current_pick);
  if picker_id is null then return; end if;
  select email into picker_email from auth.users where id=picker_id;
  select run.label,run.reminder_before into run_label,reminder from public.fantasy_test_actors actor
  join public.fantasy_test_runs run on run.id=actor.run_id where actor.user_id=picker_id;
  reminder:=coalesce(reminder,interval '30 minutes');
  target_email:=case when run_label is null then picker_email else 'delivered+'||run_label||'-'||left(replace(picker_id::text,'-',''),8)||'@resend.dev' end;
  started_at:=coalesce((select max(selected_at) from public.fantasy_picks where season_id=p_season_id),season_record.draft_started_at);
  insert into public.fantasy_notifications(season_id,pick_number,kind,recipient_user_id,intended_email,delivery_email,due_at)
  values
    (p_season_id,season_record.current_pick,'turn_started',picker_id,picker_email,target_email,started_at),
    (p_season_id,season_record.current_pick,'turn_reminder',picker_id,picker_email,target_email,season_record.pick_deadline-reminder)
  on conflict (season_id,pick_number,kind) do nothing;
end
$$;

create or replace function public.fantasy_standings(p_season_id uuid)
returns table (user_id uuid, points bigint)
language sql stable security definer set search_path = '' as $$
  with season as (
    select season.*,league.test_run_id from public.fantasy_seasons season join public.fantasy_leagues league on league.id=season.league_id where season.id=p_season_id
  ), events as (
    select l.user_id actor_id,l.snack_id,l.logged_at occurred_at,actor.run_id actor_run_id from public.snack_logs l left join public.fantasy_test_actors actor on actor.user_id=l.user_id
    union all
    select u.user_id,l.snack_id,u.created_at,actor.run_id from public.log_upvotes u join public.snack_logs l on l.id=u.log_id left join public.fantasy_test_actors actor on actor.user_id=u.user_id
  )
  select members.user_id,count(events.snack_id)::bigint
  from public.fantasy_draft_order members join season on true
  left join public.fantasy_roster_slots slot on slot.season_id=season.id and slot.user_id=members.user_id
  left join events on events.snack_id=slot.snack_id and events.actor_id<>members.user_id
    and (events.actor_run_id is null or events.actor_run_id=season.test_run_id)
    and events.occurred_at>=greatest(slot.effective_from,season.scoring_starts_at)
    and events.occurred_at<season.scoring_ends_at
    and (season.test_run_id is not null or extract(isodow from events.occurred_at at time zone 'America/New_York') between 1 and 5)
  where members.season_id=p_season_id group by members.user_id order by count(events.snack_id) desc,members.user_id
$$;

create or replace function public.board_feed(p_limit integer default 30,p_before timestamptz default null)
returns table (log_id uuid,snack_id uuid,snack_name text,category public.snack_category,image_url text,logger_id uuid,logger_name text,logged_at timestamptz,upvote_count bigint,viewer_upvoted boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query select l.id,s.id,s.name,s.category,s.image_url,l.user_id,p.display_name,l.logged_at,
    count(u.user_id),coalesce(bool_or(u.user_id=auth.uid()),false)
  from public.snack_logs l join public.snacks s on s.id=l.snack_id and s.merged_into_id is null
  join public.profiles p on p.user_id=l.user_id
  left join public.log_upvotes u on u.log_id=l.id and not public.is_fantasy_test_actor(u.user_id)
  where not public.is_fantasy_test_actor(l.user_id) and (p_before is null or l.logged_at<p_before)
  group by l.id,s.id,p.display_name order by l.logged_at desc,l.id desc
  limit least(greatest(coalesce(p_limit,30),1),100);
end
$$;

create or replace function public.snack_leaderboard(p_days integer default 30,p_limit integer default 10)
returns table (snack_id uuid,snack_name text,category public.snack_category,log_count bigint,upvote_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query select s.id,s.name,s.category,count(distinct l.id),count(u.user_id)
  from public.snacks s join public.snack_logs l on l.snack_id=s.id and not public.is_fantasy_test_actor(l.user_id)
  left join public.log_upvotes u on u.log_id=l.id and not public.is_fantasy_test_actor(u.user_id)
  where s.merged_into_id is null and (p_days is null or l.logged_at>=now()-make_interval(days=>greatest(p_days,1)))
  group by s.id order by count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name
  limit least(greatest(coalesce(p_limit,10),1),100);
end
$$;

create or replace function public.profile_summary(p_user_id uuid)
returns table (user_id uuid,display_name text,favorite_snack_id uuid,favorite_snack_name text,total_logs bigint,distinct_snacks bigint,category_mix jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query select p.user_id,p.display_name,p.favorite_snack_id,favorite.name,
    count(l.id),count(distinct l.snack_id),coalesce((select jsonb_object_agg(rows.category,rows.log_count) from (
      select s.category::text category,count(*) log_count from public.snack_logs logs join public.snacks s on s.id=logs.snack_id
      where logs.user_id=p.user_id and not public.is_fantasy_test_actor(logs.user_id) group by s.category
    ) rows),'{}'::jsonb)
  from public.profiles p left join public.snacks favorite on favorite.id=p.favorite_snack_id
  left join public.snack_logs l on l.user_id=p.user_id and not public.is_fantasy_test_actor(l.user_id)
  where p.user_id=p_user_id group by p.user_id,favorite.name;
end
$$;

create or replace function public.sync_badge_holders(p_badge_key text,p_holder_ids uuid[],p_award_date date,p_source_week_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare definition_id uuid; visible_holders uuid[];
begin
  select array_agg(holder_id) into visible_holders from unnest(coalesce(p_holder_ids,'{}')) holder_id where not public.is_fantasy_test_actor(holder_id);
  select id into definition_id from public.badge_definitions where key=p_badge_key;
  if definition_id is null then raise exception 'Badge definition not found.'; end if;
  update public.badge_tenures set end_date=p_award_date-1
  where badge_definition_id=definition_id and end_date is null and not(user_id=any(coalesce(visible_holders,'{}')));
  insert into public.badge_tenures(badge_definition_id,user_id,start_date,source_week_id)
  select definition_id,holder_id,p_award_date,p_source_week_id from unnest(coalesce(visible_holders,'{}')) holder_id
  where not exists(select 1 from public.badge_tenures where badge_definition_id=definition_id and user_id=holder_id and end_date is null)
  on conflict(badge_definition_id,user_id,start_date) do nothing;
end
$$;

create function public.reject_fantasy_test_bracket_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.snacks where id=new.snack_id and public.is_fantasy_test_actor(created_by)) then return null; end if;
  return new;
end
$$;
create trigger reject_fantasy_test_bracket_entry before insert on public.bracket_entries
for each row execute function public.reject_fantasy_test_bracket_entry();

create function public.filter_fantasy_test_weekly_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare top_id uuid; nutrition_id uuid; board jsonb;
begin
  select s.id into top_id from public.snacks s
  join public.snack_logs l on l.snack_id=s.id and l.logged_at>=new.published_at-interval '30 days' and l.logged_at<new.published_at and not public.is_fantasy_test_actor(l.user_id)
  left join public.log_upvotes u on u.log_id=l.id and not public.is_fantasy_test_actor(u.user_id)
  where s.merged_into_id is null and not public.is_fantasy_test_actor(s.created_by)
  group by s.id order by count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name limit 1;
  select s.id into nutrition_id from public.snacks s
  join public.snack_logs l on l.snack_id=s.id and l.logged_at>=new.published_at-interval '30 days' and l.logged_at<new.published_at and not public.is_fantasy_test_actor(l.user_id)
  left join public.log_upvotes u on u.log_id=l.id and not public.is_fantasy_test_actor(u.user_id)
  where s.merged_into_id is null and s.nutrition_verified and s.nutri_score is not null and not public.is_fantasy_test_actor(s.created_by)
  group by s.id order by s.nutri_score,count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name limit 1;
  select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.upvote_count desc,ranked.log_count desc,ranked.snack_name),'[]'::jsonb) into board from (
    select s.id snack_id,s.name snack_name,count(distinct l.id) log_count,count(u.user_id) upvote_count
    from public.snacks s join public.snack_logs l on l.snack_id=s.id and l.logged_at>=new.published_at-interval '30 days' and l.logged_at<new.published_at and not public.is_fantasy_test_actor(l.user_id)
    left join public.log_upvotes u on u.log_id=l.id and not public.is_fantasy_test_actor(u.user_id)
    where s.merged_into_id is null and not public.is_fantasy_test_actor(s.created_by)
    group by s.id order by count(u.user_id) desc,count(distinct l.id) desc,s.normalized_name limit 10
  ) ranked;
  new.payload:=jsonb_set(jsonb_set(jsonb_set(new.payload,'{topSnackId}',coalesce(to_jsonb(top_id),'null'::jsonb),true),'{nutritionSnackId}',coalesce(to_jsonb(nutrition_id),'null'::jsonb),true),'{leaderboard}',board,true);
  return new;
end
$$;
create trigger filter_fantasy_test_weekly_report before insert on public.weekly_reports
for each row execute function public.filter_fantasy_test_weekly_report();

create or replace function public.fantasy_feature_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select jsonb_build_object(
    'enabled',coalesce((select enabled from public.feature_flags where key='fantasy_enabled'),false),
    'weeksObserved',least(4,floor(extract(epoch from (now()-coalesce((select min(created_at) from public.profiles where not public.is_fantasy_test_actor(user_id)),now())))/604800)::integer),
    'dailyActiveUsers',coalesce((select round(avg(active_users),1) from (select count(distinct user_id) active_users from public.snack_logs where logged_at>=now()-interval '28 days' and not public.is_fantasy_test_actor(user_id) group by logged_on) daily),0),
    'fullBracketParticipation',coalesce((select bool_or(exists(select 1 from public.bracket_matchups played where played.week_id=w.id) and not exists(select 1 from public.bracket_matchups m where m.week_id=w.id and not exists(select 1 from public.bracket_votes v where v.matchup_id=m.id and not public.is_fantasy_test_actor(v.user_id)))) from public.bracket_weeks w),false),
    'weeklyUserGrowth',coalesce((select count(distinct user_id) from public.snack_logs where logged_at>=now()-interval '7 days' and not public.is_fantasy_test_actor(user_id)),0)>coalesce((select count(distinct user_id) from public.snack_logs where logged_at>=now()-interval '14 days' and logged_at<now()-interval '7 days' and not public.is_fantasy_test_actor(user_id)),0),
    'averageLogsPerUserWeek',coalesce((select round(count(*)::numeric/nullif(count(distinct user_id),0)/4,1) from public.snack_logs where logged_at>=now()-interval '28 days' and not public.is_fantasy_test_actor(user_id)),0)
  ) into result;
  return result;
end
$$;

revoke execute on function public.is_fantasy_test_actor(uuid),public.create_fantasy_test_run(text),
  public.register_fantasy_test_actor(uuid,uuid),public.link_fantasy_test_league(uuid,uuid),
  public.inspect_fantasy_test_run(uuid),public.prepare_fantasy_test_snack(uuid,uuid),
  public.advance_fantasy_test_draft(uuid,integer),public.complete_fantasy_test_run(uuid),
  public.fantasy_test_cleanup_targets(uuid),public.abort_fantasy_test_run(uuid),public.purge_fantasy_test_data(uuid),public.finalize_fantasy_test_cleanup(uuid),
  public.apply_fantasy_test_timing(),public.reject_fantasy_test_bracket_entry(),public.filter_fantasy_test_weekly_report() from public,anon,authenticated;
grant execute on function public.create_fantasy_test_run(text),public.register_fantasy_test_actor(uuid,uuid),
  public.link_fantasy_test_league(uuid,uuid),public.inspect_fantasy_test_run(uuid),public.prepare_fantasy_test_snack(uuid,uuid),
  public.advance_fantasy_test_draft(uuid,integer),public.complete_fantasy_test_run(uuid),
  public.fantasy_test_cleanup_targets(uuid),public.abort_fantasy_test_run(uuid),public.purge_fantasy_test_data(uuid),public.finalize_fantasy_test_cleanup(uuid) to service_role;
