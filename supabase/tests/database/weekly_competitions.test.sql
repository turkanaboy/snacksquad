begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(42);

select has_table('public', 'bracket_weeks', 'weekly bracket state is persisted');
select has_table('public', 'bracket_entries', 'unique weekly snacks are persisted');
select has_table('public', 'bracket_entry_owners', 'duplicate nominators become co-owners');
select has_table('public', 'bracket_matchups', 'round matchups are persisted');
select has_table('public', 'bracket_votes', 'matchup votes are persisted');
select has_table('public', 'badge_definitions', 'badge definitions are stable records');
select has_table('public', 'badge_tenures', 'badge ownership uses dated tenures');
select has_table('public', 'weekly_reports', 'Friday reports are immutable history');
select has_function('public', 'reconcile_competitions', array['timestamp with time zone'], 'one idempotent reconciler advances contest state');
select has_function('public', 'publish_weekly_results', array['uuid','timestamp with time zone'], 'Friday results are snapshotted explicitly');
select results_eq(
  $$select public.eastern_timestamp(date '2026-03-09', time '09:00')$$,
  $$values ('2026-03-09 13:00:00+00'::timestamptz)$$,
  'Eastern schedules honor daylight time after the spring transition'
);
select results_eq(
  $$select public.eastern_timestamp(date '2026-11-02', time '09:00')$$,
  $$values ('2026-11-02 14:00:00+00'::timestamptz)$$,
  'Eastern schedules honor standard time after the fall transition'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('12000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex.contest@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('12000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jordan.contest@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('12000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'casey.contest@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.snacks (id, name, normalized_name, category, source_type, created_by, nutri_score, nutrition_complete, nutrition_verified)
values
  ('22000000-0000-0000-0000-000000000001', 'Apple Slices', 'apple slices', 'Fruit', 'open_food_facts', '12000000-0000-0000-0000-000000000001', 'a', true, true),
  ('22000000-0000-0000-0000-000000000002', 'Pretzels', 'pretzels', 'Grains/Bakery', 'manual', '12000000-0000-0000-0000-000000000001', null, false, false),
  ('22000000-0000-0000-0000-000000000003', 'Cheese Cubes', 'cheese cubes', 'Dairy', 'manual', '12000000-0000-0000-0000-000000000002', null, false, false),
  ('22000000-0000-0000-0000-000000000004', 'Popcorn', 'popcorn', 'Chips/Savory Snacks', 'manual', '12000000-0000-0000-0000-000000000003', null, false, false);

insert into public.snack_logs (id, user_id, snack_id, logged_at) values
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', now()),
  ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', now()),
  ('32000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000003', now());
insert into public.log_upvotes (log_id, user_id) values
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000003'),
  ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001');

insert into public.bracket_weeks (
  id, week_start, status, nomination_opens_at, nomination_closes_at, results_publish_at
) values (
  '42000000-0000-0000-0000-000000000001', public.eastern_date(now()), 'nominations',
  now() - interval '1 hour', now() + interval '1 hour', now() + interval '4 days'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.nominate_bracket_snack('42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001')$$,
  'first member can nominate a snack'
);
select throws_ok(
  $$select public.nominate_bracket_snack('42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002')$$,
  '23505', null,
  'one member cannot nominate twice in a week'
);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.nominate_bracket_snack('42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001')$$,
  'duplicate nomination adds a co-owner'
);
reset role;

select results_eq(
  $$select count(*)::bigint from public.bracket_entries where week_id = '42000000-0000-0000-0000-000000000001'$$,
  $$values (1::bigint)$$,
  'duplicate nominations retain one bracket entry'
);
select results_eq(
  $$select count(*)::bigint from public.bracket_entry_owners where week_id = '42000000-0000-0000-0000-000000000001'$$,
  $$values (2::bigint)$$,
  'both nominators own the shared entry'
);

update public.bracket_weeks set nomination_closes_at = now() - interval '1 minute' where id = '42000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select public.seed_bracket('42000000-0000-0000-0000-000000000001', now())$$,
  'seeding fills open slots from the rolling leaderboard'
);
select results_eq(
  $$select count(*)::bigint from public.bracket_entries where week_id = '42000000-0000-0000-0000-000000000001' and seed is not null$$,
  $$values (3::bigint)$$,
  'all available qualifying catalog snacks are seeded once'
);
select results_eq(
  $$select seed from public.bracket_entries where week_id = '42000000-0000-0000-0000-000000000001' and snack_id = '22000000-0000-0000-0000-000000000001'$$,
  $$values (1::smallint)$$,
  'most-owned nominated snack receives the first seed'
);

select results_eq(
  $$select count(*)::bigint from public.bracket_matchups where week_id = '42000000-0000-0000-0000-000000000001' and round_number = 1$$,
  $$values (2::bigint)$$,
  'round one matchups are created from seeded entries'
);

update public.bracket_matchups
set status = 'open', opens_at = now() - interval '1 hour', closes_at = now() + interval '1 hour'
where week_id = '42000000-0000-0000-0000-000000000001' and position = 1;

select set_config('test.matchup_id', id::text, false),
  set_config('test.left_entry_id', left_entry_id::text, false),
  set_config('test.right_entry_id', right_entry_id::text, false)
from public.bracket_matchups
where week_id = '42000000-0000-0000-0000-000000000001' and round_number = 1 and position = 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.cast_bracket_vote(current_setting('test.matchup_id')::uuid, current_setting('test.left_entry_id')::uuid)$$,
  'member can vote in an open matchup'
);
select lives_ok(
  $$select public.cast_bracket_vote(current_setting('test.matchup_id')::uuid, current_setting('test.right_entry_id')::uuid)$$,
  'member can change an open vote'
);
reset role;
select results_eq(
  $$select count(*)::bigint from public.bracket_votes where user_id = '12000000-0000-0000-0000-000000000003'$$,
  $$values (1::bigint)$$,
  'latest matchup vote replaces the prior choice'
);

insert into public.bracket_votes (matchup_id, user_id, entry_id)
values (current_setting('test.matchup_id')::uuid, '12000000-0000-0000-0000-000000000001', current_setting('test.left_entry_id')::uuid);
update public.bracket_matchups
set status = 'open', closes_at = now() - interval '1 minute'
where id = current_setting('test.matchup_id')::uuid;
select lives_ok(
  $$select public.reconcile_competitions(now())$$,
  'a tied matchup enters sudden death at the daily close'
);
select results_eq(
  $$select status::text from public.bracket_matchups where id = current_setting('test.matchup_id')::uuid$$,
  $$values ('sudden_death'::text)$$,
  'tied matchup remains open for sudden death'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.cast_bracket_vote(current_setting('test.matchup_id')::uuid, current_setting('test.left_entry_id')::uuid)$$,
  'next valid sudden-death vote resolves the matchup'
);
reset role;
select results_eq(
  $$select winner_entry_id from public.bracket_matchups where id = current_setting('test.matchup_id')::uuid$$,
  $$values (current_setting('test.left_entry_id')::uuid)$$,
  'sudden-death vote chooses the winner atomically'
);

insert into public.bracket_matchups (
  id, week_id, round_number, position, left_entry_id, right_entry_id,
  status, opens_at, closes_at, sudden_death_until
) values (
  '52000000-0000-0000-0000-000000000008', '42000000-0000-0000-0000-000000000001', 1, 8,
  current_setting('test.left_entry_id')::uuid, current_setting('test.right_entry_id')::uuid,
  'sudden_death', now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 minute'
);
select lives_ok(
  $$select public.reconcile_competitions(now())$$,
  'expired sudden death resolves without manual intervention'
);
select results_eq(
  $$select winner_entry_id from public.bracket_matchups where id = '52000000-0000-0000-0000-000000000008'$$,
  $$values (current_setting('test.left_entry_id')::uuid)$$,
  'expired tie advances the higher seed'
);

update public.bracket_weeks
set champion_entry_id = current_setting('test.left_entry_id')::uuid,
    results_publish_at = now() + interval '1 second'
where id = '42000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select public.publish_weekly_results('42000000-0000-0000-0000-000000000001', now() + interval '2 seconds')$$,
  'Friday publication snapshots winners and recognition'
);
select results_eq(
  $$select count(*)::bigint from public.weekly_reports where week_id = '42000000-0000-0000-0000-000000000001'$$,
  $$values (1::bigint)$$,
  'one in-app Friday report is persisted'
);
select results_eq(
  $$select count(*)::bigint from public.badge_tenures t join public.badge_definitions d on d.id = t.badge_definition_id where d.key = 'bracket-champion'$$,
  $$values (2::bigint)$$,
  'every nominator co-owning the champion receives the badge'
);
select lives_ok(
  $$select public.publish_weekly_results('42000000-0000-0000-0000-000000000001', now() + interval '2 seconds')$$,
  'Friday publication can be rerun safely'
);
select results_eq(
  $$select count(*)::bigint from public.weekly_reports where week_id = '42000000-0000-0000-0000-000000000001'$$,
  $$values (1::bigint)$$,
  'rerun does not duplicate the Friday report'
);

select lives_ok(
  $$select public.sync_badge_holders('top-snack', array['12000000-0000-0000-0000-000000000001'::uuid], date '2026-07-10', '42000000-0000-0000-0000-000000000001')$$,
  'first weekly winner opens a badge tenure'
);
select lives_ok(
  $$select public.sync_badge_holders('top-snack', array['12000000-0000-0000-0000-000000000001'::uuid], date '2026-07-17', '42000000-0000-0000-0000-000000000001')$$,
  'consecutive win extends the active tenure idempotently'
);
select results_eq(
  $$select count(*)::bigint from public.badge_tenures t join public.badge_definitions d on d.id = t.badge_definition_id where d.key = 'top-snack' and t.user_id = '12000000-0000-0000-0000-000000000001' and t.end_date is null$$,
  $$values (1::bigint)$$,
  'consecutive win does not duplicate a tenure'
);
select lives_ok(
  $$select public.sync_badge_holders('top-snack', array['12000000-0000-0000-0000-000000000002'::uuid], date '2026-07-24', '42000000-0000-0000-0000-000000000001')$$,
  'dethroning closes the old holder and opens the new holder'
);
select lives_ok(
  $$select public.sync_badge_holders('top-snack', array['12000000-0000-0000-0000-000000000001'::uuid], date '2026-07-31', '42000000-0000-0000-0000-000000000001')$$,
  'reclaimed badge opens a new tenure'
);
select results_eq(
  $$select count(*)::bigint from public.badge_tenures t join public.badge_definitions d on d.id = t.badge_definition_id where d.key = 'top-snack' and t.user_id = '12000000-0000-0000-0000-000000000001'$$,
  $$values (2::bigint)$$,
  'reclaimed badge retains both historical tenures'
);
select results_eq(
  $$select t.end_date from public.badge_tenures t join public.badge_definitions d on d.id = t.badge_definition_id where d.key = 'top-snack' and t.user_id = '12000000-0000-0000-0000-000000000002' order by t.start_date desc limit 1$$,
  $$values (date '2026-07-30')$$,
  'dethroned tenure receives an inclusive end date'
);

select * from finish();
rollback;
