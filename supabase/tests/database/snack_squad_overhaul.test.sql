begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

select has_function('public', 'before_user_created_hook', array['jsonb'], 'company-domain auth hook exists');
select lives_ok(
  $$select public.before_user_created_hook('{"user":{"email":"Ada@CARNEGIEHIGHERED.COM"}}'::jsonb)$$,
  'company email is accepted case-insensitively'
);
select results_eq(
  $$select public.before_user_created_hook('{"user":{"email":"ada@example.com"}}'::jsonb)$$,
  $$values ('{"error":{"message":"Only @carnegiehighered.com email addresses can join Snack Squad.","http_code":403}}'::jsonb)$$,
  'outside email domain is rejected before user creation'
);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'snacks', 'canonical snacks table exists');
select has_table('public', 'snack_logs', 'private snack logs table exists');
select has_table('public', 'log_upvotes', 'entry upvotes table exists');
select has_table('public', 'moderators', 'moderator allowlist exists');
select has_table('public', 'feature_flags', 'feature flags exist');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jordan@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'moderator@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select results_eq(
  $$select display_name from public.profiles where user_id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  $$values ('Alex'::text)$$,
  'confirmed auth user receives an email-derived profile'
);

insert into public.snacks (id, name, normalized_name, category, source_type, created_by)
values ('20000000-0000-0000-0000-000000000001', 'Doritos', 'doritos', 'Chips/Savory Snacks', 'manual', '10000000-0000-0000-0000-000000000001');

insert into public.snack_logs (id, user_id, snack_id, logged_at)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now()),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', now());

select throws_ok(
  $$insert into public.snack_logs (user_id, snack_id, logged_at) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now())$$,
  '23505', null,
  'same user cannot score the same snack twice on one Eastern day'
);

select lives_ok(
  $$insert into public.log_upvotes (log_id, user_id) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')$$,
  'coworker can upvote an entry'
);
select throws_ok(
  $$insert into public.log_upvotes (log_id, user_id) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$,
  '23514', null,
  'a user cannot upvote their own entry'
);
select throws_ok(
  $$insert into public.log_upvotes (log_id, user_id) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')$$,
  '23505', null,
  'a user cannot upvote an entry twice'
);

set local role anon;
select throws_ok(
  'select * from public.snacks',
  '42501', null,
  'anonymous users cannot read snacks'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select results_eq(
  'select count(*)::bigint from public.profiles',
  'values (1::bigint)',
  'authenticated users can read only their own profile row'
);
select results_eq(
  'select count(*)::bigint from public.snack_logs',
  'values (1::bigint)',
  'authenticated users can read only their detailed log rows'
);
select lives_ok(
  $$select * from public.board_feed(20, null)$$,
  'authenticated users can read the narrow shared board projection'
);
select results_eq(
  $$select count(*)::bigint from public.board_feed(20, null)$$,
  $$values (2::bigint)$$,
  'board projection includes separate coworker entries'
);
select results_eq(
  $$select count(*)::bigint from public.profile_summary('10000000-0000-0000-0000-000000000002')$$,
  $$values (1::bigint)$$,
  'coworker profile summary is available without detailed log rows'
);
select lives_ok(
  $$delete from public.snack_logs where id = '30000000-0000-0000-0000-000000000001'$$,
  'owner can delete an open same-day log'
);
reset role;

insert into public.snack_logs (id, user_id, snack_id, logged_at)
values ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now() - interval '2 days');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$delete from public.snack_logs where id = '30000000-0000-0000-0000-000000000003'$$,
  'P0001',
  'Snack logs can only be changed on the day they were logged.',
  'owner cannot delete a closed-day log'
);
select results_eq(
  $$with changed as (update public.snacks set name = 'Not allowed' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'regular member cannot edit canonical snack metadata'
);
reset role;

insert into public.moderators (user_id) values ('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select results_eq(
  $$with changed as (update public.snacks set name = 'Doritos Updated' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'designated moderator can edit canonical snack metadata'
);
reset role;

select * from finish();
rollback;
