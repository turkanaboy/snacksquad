create type public.bracket_week_status as enum (
  'nominations', 'round_of_16', 'quarterfinals', 'semifinals', 'final', 'results'
);
create type public.bracket_matchup_status as enum ('scheduled', 'open', 'sudden_death', 'resolved');

create table public.bracket_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status public.bracket_week_status not null default 'nominations',
  nomination_opens_at timestamptz not null,
  nomination_closes_at timestamptz not null,
  results_publish_at timestamptz not null,
  champion_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nomination_opens_at < nomination_closes_at),
  check (nomination_closes_at < results_publish_at)
);

create table public.bracket_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.bracket_weeks(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  seed smallint check (seed between 1 and 16),
  created_at timestamptz not null default now(),
  unique (week_id, snack_id),
  unique (week_id, seed),
  unique (id, week_id)
);

alter table public.bracket_weeks
  add constraint bracket_weeks_champion_entry_fk
  foreign key (champion_entry_id) references public.bracket_entries(id);

create table public.bracket_entry_owners (
  week_id uuid not null references public.bracket_weeks(id) on delete cascade,
  entry_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  nominated_at timestamptz not null default now(),
  primary key (entry_id, user_id),
  unique (week_id, user_id),
  foreign key (entry_id, week_id) references public.bracket_entries(id, week_id) on delete cascade
);

create table public.bracket_matchups (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.bracket_weeks(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 4),
  position smallint not null check (position between 1 and 8),
  left_entry_id uuid not null references public.bracket_entries(id),
  right_entry_id uuid references public.bracket_entries(id),
  winner_entry_id uuid references public.bracket_entries(id),
  status public.bracket_matchup_status not null default 'scheduled',
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  sudden_death_until timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, round_number, position),
  check (left_entry_id <> right_entry_id),
  check (winner_entry_id is null or winner_entry_id in (left_entry_id, right_entry_id)),
  check (opens_at < closes_at)
);

create table public.bracket_votes (
  matchup_id uuid not null references public.bracket_matchups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.bracket_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (matchup_id, user_id)
);

create table public.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (char_length(trim(key)) between 1 and 100),
  label text not null check (char_length(trim(label)) between 1 and 120),
  kind text not null check (kind in ('top_snack', 'nutrition', 'category', 'bracket', 'fantasy')),
  category public.snack_category,
  created_at timestamptz not null default now(),
  check ((kind = 'category') = (category is not null))
);

create table public.badge_tenures (
  id uuid primary key default gen_random_uuid(),
  badge_definition_id uuid not null references public.badge_definitions(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date,
  source_week_id uuid references public.bracket_weeks(id),
  created_at timestamptz not null default now(),
  unique (badge_definition_id, user_id, start_date),
  check (end_date is null or end_date >= start_date)
);
create unique index badge_tenures_one_active_idx
  on public.badge_tenures(badge_definition_id, user_id) where end_date is null;

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null unique references public.bracket_weeks(id),
  report_date date not null unique,
  published_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index bracket_entries_snack_id_idx on public.bracket_entries(snack_id);
create index bracket_entry_owners_user_id_idx on public.bracket_entry_owners(user_id);
create index bracket_matchups_state_idx on public.bracket_matchups(status, closes_at);
create index bracket_votes_user_id_idx on public.bracket_votes(user_id);
create index bracket_votes_entry_id_idx on public.bracket_votes(entry_id);
create index badge_tenures_user_id_idx on public.badge_tenures(user_id, start_date desc);
create index badge_tenures_source_week_id_idx on public.badge_tenures(source_week_id);

insert into public.badge_definitions (key, label, kind, category) values
  ('top-snack', 'Top Snack', 'top_snack', null),
  ('nutrition-standout', 'Nutrition Standout', 'nutrition', null),
  ('bracket-champion', 'Bracket Champion', 'bracket', null),
  ('category-grains-bakery', 'Top Grains/Bakery Snack', 'category', 'Grains/Bakery'),
  ('category-protein', 'Top Protein Snack', 'category', 'Protein'),
  ('category-dairy', 'Top Dairy Snack', 'category', 'Dairy'),
  ('category-fruit', 'Top Fruit Snack', 'category', 'Fruit'),
  ('category-vegetables', 'Top Vegetables Snack', 'category', 'Vegetables'),
  ('category-candy-sweets', 'Top Candy/Sweets Snack', 'category', 'Candy/Sweets'),
  ('category-chips-savory', 'Top Chips/Savory Snack', 'category', 'Chips/Savory Snacks'),
  ('category-beverages', 'Top Beverage', 'category', 'Beverages'),
  ('category-other', 'Top Other Snack', 'category', 'Other');

create function public.eastern_timestamp(value date, wall_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (value + wall_time) at time zone 'America/New_York'
$$;

create function public.nominate_bracket_snack(p_week_id uuid, p_snack_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_record public.bracket_weeks;
  entry_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into week_record from public.bracket_weeks where id = p_week_id for update;
  if week_record.id is null or week_record.status <> 'nominations' then raise exception 'Nominations are closed.'; end if;
  if now() < week_record.nomination_opens_at or now() >= week_record.nomination_closes_at then raise exception 'Nominations are closed.'; end if;
  if not exists (select 1 from public.snacks where id = p_snack_id and merged_into_id is null) then raise exception 'Snack not found.'; end if;

  insert into public.bracket_entries (week_id, snack_id)
  values (p_week_id, p_snack_id)
  on conflict (week_id, snack_id) do update set snack_id = excluded.snack_id
  returning id into entry_id;

  insert into public.bracket_entry_owners (week_id, entry_id, user_id)
  values (p_week_id, entry_id, auth.uid());
  return entry_id;
end
$$;

create function public.seed_bracket(p_week_id uuid, p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_record public.bracket_weeks;
begin
  select * into week_record from public.bracket_weeks where id = p_week_id for update;
  if week_record.id is null then raise exception 'Bracket week not found.'; end if;
  if p_at < week_record.nomination_closes_at then raise exception 'Nominations are still open.'; end if;
  if exists (select 1 from public.bracket_entries where week_id = p_week_id and seed is not null) then return; end if;

  insert into public.bracket_entries (week_id, snack_id, created_at)
  select p_week_id, ranked.snack_id, p_at
  from (
    select s.id as snack_id,
      count(distinct l.id) as log_count,
      count(u.user_id) as upvote_count,
      s.normalized_name
    from public.snacks s
    join public.snack_logs l on l.snack_id = s.id and l.logged_at >= p_at - interval '30 days'
    left join public.log_upvotes u on u.log_id = l.id
    where s.merged_into_id is null
      and not exists (select 1 from public.bracket_entries e where e.week_id = p_week_id and e.snack_id = s.id)
    group by s.id
    order by count(u.user_id) desc, count(distinct l.id) desc, s.normalized_name
    limit greatest(16 - (select count(*) from public.bracket_entries where week_id = p_week_id), 0)
  ) ranked
  on conflict (week_id, snack_id) do nothing;

  with ranked as (
    select e.id,
      row_number() over (
        order by count(o.user_id) desc,
          min(o.nominated_at) nulls last,
          coalesce((select count(u.user_id) from public.snack_logs l left join public.log_upvotes u on u.log_id = l.id where l.snack_id = e.snack_id and l.logged_at >= p_at - interval '30 days'), 0) desc,
          s.normalized_name
      ) as next_seed
    from public.bracket_entries e
    join public.snacks s on s.id = e.snack_id
    left join public.bracket_entry_owners o on o.entry_id = e.id
    where e.week_id = p_week_id
    group by e.id, s.normalized_name
  )
  update public.bracket_entries e
  set seed = ranked.next_seed
  from ranked
  where e.id = ranked.id and ranked.next_seed <= 16;

  insert into public.bracket_matchups (
    week_id, round_number, position, left_entry_id, right_entry_id,
    status, opens_at, closes_at
  )
  select p_week_id, 1, ((left_entry.seed + 1) / 2)::smallint,
    left_entry.id, right_entry.id,
    'open',
    public.eastern_timestamp(week_record.week_start, time '09:00'),
    public.eastern_timestamp(week_record.week_start, time '17:00')
  from public.bracket_entries left_entry
  left join public.bracket_entries right_entry
    on right_entry.week_id = left_entry.week_id and right_entry.seed = left_entry.seed + 1
  where left_entry.week_id = p_week_id and left_entry.seed % 2 = 1
  on conflict (week_id, round_number, position) do nothing;

  update public.bracket_weeks set status = 'round_of_16', updated_at = p_at where id = p_week_id;
end
$$;

create function public.cast_bracket_vote(p_matchup_id uuid, p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matchup public.bracket_matchups;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into matchup from public.bracket_matchups where id = p_matchup_id for update;
  if matchup.id is null or matchup.status not in ('open', 'sudden_death') then raise exception 'Matchup is not open.'; end if;
  if now() < matchup.opens_at or now() >= coalesce(matchup.sudden_death_until, matchup.closes_at) then raise exception 'Matchup is not open.'; end if;
  if p_entry_id not in (matchup.left_entry_id, matchup.right_entry_id) then raise exception 'Entry is not in this matchup.'; end if;

  insert into public.bracket_votes (matchup_id, user_id, entry_id)
  values (p_matchup_id, auth.uid(), p_entry_id)
  on conflict (matchup_id, user_id) do update
    set entry_id = excluded.entry_id, updated_at = now();

  if matchup.status = 'sudden_death' then
    update public.bracket_matchups
    set winner_entry_id = p_entry_id, status = 'resolved', resolved_at = now(), updated_at = now()
    where id = p_matchup_id and status = 'sudden_death';
  end if;
end
$$;

create function public.sync_badge_holders(
  p_badge_key text,
  p_holder_ids uuid[],
  p_award_date date,
  p_source_week_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition_id uuid;
begin
  select id into definition_id from public.badge_definitions where key = p_badge_key;
  if definition_id is null then raise exception 'Badge definition not found.'; end if;

  update public.badge_tenures
  set end_date = p_award_date - 1
  where badge_definition_id = definition_id
    and end_date is null
    and not (user_id = any(coalesce(p_holder_ids, '{}')));

  insert into public.badge_tenures (badge_definition_id, user_id, start_date, source_week_id)
  select definition_id, holder_id, p_award_date, p_source_week_id
  from unnest(coalesce(p_holder_ids, '{}')) holder_id
  where not exists (
    select 1 from public.badge_tenures
    where badge_definition_id = definition_id
      and user_id = holder_id
      and end_date is null
  )
  on conflict (badge_definition_id, user_id, start_date) do nothing;
end
$$;

create function public.contest_overview(p_week_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select jsonb_build_object(
    'week', to_jsonb(w),
    'entries', coalesce((select jsonb_agg(to_jsonb(e) order by e.seed nulls last, e.created_at) from public.bracket_entries e where e.week_id = w.id), '[]'::jsonb),
    'owners', coalesce((select jsonb_agg(to_jsonb(o) order by o.nominated_at) from public.bracket_entry_owners o where o.week_id = w.id), '[]'::jsonb),
    'matchups', coalesce((select jsonb_agg(to_jsonb(m) order by m.round_number, m.position) from public.bracket_matchups m where m.week_id = w.id), '[]'::jsonb),
    'viewerVotes', coalesce((
      select jsonb_agg(to_jsonb(v))
      from public.bracket_votes v
      join public.bracket_matchups m on m.id = v.matchup_id
      where m.week_id = w.id and v.user_id = auth.uid()
    ), '[]'::jsonb)
  ) into result
  from public.bracket_weeks w where w.id = p_week_id;
  return result;
end
$$;

create function public.current_contest_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare week_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select id into week_id from public.bracket_weeks order by week_start desc limit 1;
  if week_id is null then return null; end if;
  return public.contest_overview(week_id);
end
$$;

create function public.weekly_report_feed(p_limit integer default 8)
returns table (week_id uuid, report_date date, published_at timestamptz, payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query
  select r.week_id, r.report_date, r.published_at, r.payload
  from public.weekly_reports r
  order by r.report_date desc
  limit least(greatest(coalesce(p_limit, 8), 1), 52);
end
$$;

create function public.profile_badges(p_user_id uuid)
returns table (badge_key text, label text, start_date date, end_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query
  select d.key, d.label, t.start_date, t.end_date
  from public.badge_tenures t
  join public.badge_definitions d on d.id = t.badge_definition_id
  where t.user_id = p_user_id
  order by t.start_date desc, d.label;
end
$$;

alter table public.bracket_weeks enable row level security;
alter table public.bracket_entries enable row level security;
alter table public.bracket_entry_owners enable row level security;
alter table public.bracket_matchups enable row level security;
alter table public.bracket_votes enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.badge_tenures enable row level security;
alter table public.weekly_reports enable row level security;

revoke all on public.bracket_weeks, public.bracket_entries, public.bracket_entry_owners,
  public.bracket_matchups, public.bracket_votes, public.badge_definitions,
  public.badge_tenures, public.weekly_reports from anon, authenticated;

revoke execute on function public.nominate_bracket_snack(uuid, uuid) from public, anon;
revoke execute on function public.cast_bracket_vote(uuid, uuid) from public, anon;
revoke execute on function public.contest_overview(uuid) from public, anon;
revoke execute on function public.current_contest_overview() from public, anon;
revoke execute on function public.weekly_report_feed(integer) from public, anon;
revoke execute on function public.profile_badges(uuid) from public, anon;
revoke execute on function public.seed_bracket(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.sync_badge_holders(text, uuid[], date, uuid) from public, anon, authenticated;
grant execute on function public.nominate_bracket_snack(uuid, uuid) to authenticated;
grant execute on function public.cast_bracket_vote(uuid, uuid) to authenticated;
grant execute on function public.contest_overview(uuid) to authenticated;
grant execute on function public.current_contest_overview() to authenticated;
grant execute on function public.weekly_report_feed(integer) to authenticated;
grant execute on function public.profile_badges(uuid) to authenticated;

create function public.publish_weekly_results(p_week_id uuid, p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_record public.bracket_weeks;
  top_snack_id uuid;
  nutrition_snack_id uuid;
  holder_ids uuid[];
  category_badge record;
  category_snack_id uuid;
  report_payload jsonb;
begin
  select * into week_record from public.bracket_weeks where id = p_week_id for update;
  if week_record.id is null then raise exception 'Bracket week not found.'; end if;
  if p_at < week_record.results_publish_at then raise exception 'Weekly results are not ready.'; end if;
  if exists (select 1 from public.weekly_reports where week_id = p_week_id) then return; end if;

  select s.id into top_snack_id
  from public.snacks s
  join public.snack_logs l on l.snack_id = s.id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at
  left join public.log_upvotes u on u.log_id = l.id
  where s.merged_into_id is null
  group by s.id
  order by count(u.user_id) desc, count(distinct l.id) desc, s.normalized_name
  limit 1;

  select array_agg(distinct l.user_id) into holder_ids
  from public.snack_logs l
  where l.snack_id = top_snack_id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at;
  perform public.sync_badge_holders('top-snack', coalesce(holder_ids, '{}'), public.eastern_date(p_at), p_week_id);

  select s.id into nutrition_snack_id
  from public.snacks s
  join public.snack_logs l on l.snack_id = s.id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at
  left join public.log_upvotes u on u.log_id = l.id
  where s.merged_into_id is null and s.nutrition_verified and s.nutri_score is not null
  group by s.id
  order by s.nutri_score, count(u.user_id) desc, count(distinct l.id) desc, s.normalized_name
  limit 1;

  select array_agg(distinct l.user_id) into holder_ids
  from public.snack_logs l
  where l.snack_id = nutrition_snack_id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at;
  perform public.sync_badge_holders('nutrition-standout', coalesce(holder_ids, '{}'), public.eastern_date(p_at), p_week_id);

  for category_badge in
    select key, category from public.badge_definitions where kind = 'category' order by key
  loop
    select s.id into category_snack_id
    from public.snacks s
    join public.snack_logs l on l.snack_id = s.id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at
    left join public.log_upvotes u on u.log_id = l.id
    where s.merged_into_id is null and s.category = category_badge.category
    group by s.id
    order by count(u.user_id) desc, count(distinct l.id) desc, s.normalized_name
    limit 1;

    select array_agg(distinct l.user_id) into holder_ids
    from public.snack_logs l
    where l.snack_id = category_snack_id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at;
    perform public.sync_badge_holders(category_badge.key, coalesce(holder_ids, '{}'), public.eastern_date(p_at), p_week_id);
    category_snack_id := null;
    holder_ids := null;
  end loop;

  select array_agg(user_id order by user_id) into holder_ids
  from public.bracket_entry_owners
  where entry_id = week_record.champion_entry_id;
  perform public.sync_badge_holders('bracket-champion', coalesce(holder_ids, '{}'), public.eastern_date(p_at), p_week_id);

  select jsonb_build_object(
    'weekStart', week_record.week_start,
    'topSnackId', top_snack_id,
    'nutritionSnackId', nutrition_snack_id,
    'bracketChampionEntryId', week_record.champion_entry_id,
    'leaderboard', coalesce((
      select jsonb_agg(to_jsonb(board) order by board.upvote_count desc, board.log_count desc, board.snack_name)
      from (
        select s.id as snack_id, s.name as snack_name,
          count(distinct l.id) as log_count, count(u.user_id) as upvote_count
        from public.snacks s
        join public.snack_logs l on l.snack_id = s.id and l.logged_at >= p_at - interval '30 days' and l.logged_at < p_at
        left join public.log_upvotes u on u.log_id = l.id
        where s.merged_into_id is null
        group by s.id
        order by count(u.user_id) desc, count(distinct l.id) desc, s.normalized_name
        limit 10
      ) board
    ), '[]'::jsonb)
  ) into report_payload;

  insert into public.weekly_reports (week_id, report_date, published_at, payload)
  values (p_week_id, public.eastern_date(p_at), p_at, report_payload)
  on conflict (week_id) do nothing;

  update public.bracket_weeks
  set status = 'results', updated_at = p_at
  where id = p_week_id;
end
$$;

create function public.reconcile_competitions(p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_date date := public.eastern_date(p_at);
  local_dow integer := extract(isodow from local_date);
  target_monday date;
  week_record public.bracket_weeks;
  matchup_record public.bracket_matchups;
  left_votes bigint;
  right_votes bigint;
  higher_seed_entry uuid;
  current_round smallint;
  next_round smallint;
  next_open timestamptz;
  next_close timestamptz;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('snack-squad-competition-reconciler', 0)) then return; end if;

  target_monday := case
    when local_dow <= 4 then local_date - (local_dow - 1)
    else local_date + (8 - local_dow)
  end;

  if p_at >= public.eastern_timestamp(target_monday - 3, time '09:00') then
    insert into public.bracket_weeks (
      week_start, nomination_opens_at, nomination_closes_at, results_publish_at
    ) values (
      target_monday,
      public.eastern_timestamp(target_monday - 3, time '09:00'),
      public.eastern_timestamp(target_monday, time '09:00'),
      public.eastern_timestamp(target_monday + 4, time '09:00')
    ) on conflict (week_start) do nothing;
  end if;

  for week_record in
    select * from public.bracket_weeks where status <> 'results' order by week_start for update
  loop
    if week_record.status = 'nominations' and p_at >= week_record.nomination_closes_at then
      perform public.seed_bracket(week_record.id, p_at);
    end if;

    for matchup_record in
      select * from public.bracket_matchups
      where week_id = week_record.id and status in ('open', 'sudden_death')
      order by round_number, position
      for update
    loop
      if matchup_record.status = 'open' and p_at >= matchup_record.closes_at then
        if matchup_record.right_entry_id is null then
          update public.bracket_matchups
          set winner_entry_id = matchup_record.left_entry_id, status = 'resolved', resolved_at = p_at, updated_at = p_at
          where id = matchup_record.id;
        else
          select count(*) filter (where entry_id = matchup_record.left_entry_id),
            count(*) filter (where entry_id = matchup_record.right_entry_id)
          into left_votes, right_votes
          from public.bracket_votes where matchup_id = matchup_record.id;

          if left_votes <> right_votes then
            update public.bracket_matchups
            set winner_entry_id = case when left_votes > right_votes then matchup_record.left_entry_id else matchup_record.right_entry_id end,
              status = 'resolved', resolved_at = p_at, updated_at = p_at
            where id = matchup_record.id;
          elsif p_at < matchup_record.closes_at + interval '1 hour' then
            update public.bracket_matchups
            set status = 'sudden_death', sudden_death_until = matchup_record.closes_at + interval '1 hour', updated_at = p_at
            where id = matchup_record.id;
          else
            select e.id into higher_seed_entry
            from public.bracket_entries e
            where e.id in (matchup_record.left_entry_id, matchup_record.right_entry_id)
            order by e.seed
            limit 1;
            update public.bracket_matchups
            set winner_entry_id = higher_seed_entry, status = 'resolved', resolved_at = p_at, updated_at = p_at
            where id = matchup_record.id;
          end if;
        end if;
      elsif matchup_record.status = 'sudden_death' and p_at >= matchup_record.sudden_death_until then
        select e.id into higher_seed_entry
        from public.bracket_entries e
        where e.id in (matchup_record.left_entry_id, matchup_record.right_entry_id)
        order by e.seed
        limit 1;
        update public.bracket_matchups
        set winner_entry_id = higher_seed_entry, status = 'resolved', resolved_at = p_at, updated_at = p_at
        where id = matchup_record.id;
      end if;
    end loop;

    select max(round_number) into current_round from public.bracket_matchups where week_id = week_record.id;
    if current_round is not null
      and not exists (select 1 from public.bracket_matchups where week_id = week_record.id and round_number = current_round and status <> 'resolved')
    then
      if current_round < 4 and not exists (
        select 1 from public.bracket_matchups where week_id = week_record.id and round_number = current_round + 1
      ) then
        next_round := current_round + 1;
        next_open := public.eastern_timestamp(week_record.week_start + current_round, time '09:00');
        next_close := public.eastern_timestamp(week_record.week_start + current_round, time '17:00');
        if p_at >= next_open then
          with winners as (
            select winner_entry_id,
              row_number() over (order by position) as winner_position
            from public.bracket_matchups
            where week_id = week_record.id and round_number = current_round
          )
          insert into public.bracket_matchups (
            week_id, round_number, position, left_entry_id, right_entry_id,
            status, opens_at, closes_at
          )
          select week_record.id, next_round, ((left_winner.winner_position + 1) / 2)::smallint,
            left_winner.winner_entry_id, right_winner.winner_entry_id,
            'open', next_open, next_close
          from winners left_winner
          left join winners right_winner on right_winner.winner_position = left_winner.winner_position + 1
          where left_winner.winner_position % 2 = 1;

          update public.bracket_weeks
          set status = case next_round
            when 2 then 'quarterfinals'::public.bracket_week_status
            when 3 then 'semifinals'::public.bracket_week_status
            else 'final'::public.bracket_week_status
          end,
          updated_at = p_at
          where id = week_record.id;
        end if;
      elsif current_round = 4 then
        update public.bracket_weeks
        set champion_entry_id = (
          select winner_entry_id from public.bracket_matchups
          where week_id = week_record.id and round_number = 4 and position = 1
        ), updated_at = p_at
        where id = week_record.id and champion_entry_id is null;
      end if;
    end if;

    select * into week_record from public.bracket_weeks where id = week_record.id;
    if week_record.champion_entry_id is not null and p_at >= week_record.results_publish_at then
      perform public.publish_weekly_results(week_record.id, p_at);
    end if;
  end loop;
end
$$;

revoke execute on function public.publish_weekly_results(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.reconcile_competitions(timestamptz) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'snack-squad-competition-reconciler';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'snack-squad-competition-reconciler',
    '*/5 * * * *',
    'select public.reconcile_competitions()'
  );
end
$$;
