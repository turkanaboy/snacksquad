begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

select has_table('public', 'snack_preferences', 'private snack preferences are persisted');
select has_table('public', 'snack_releases', 'new snack releases are persisted');
select col_not_null('public', 'snack_releases', 'article_url', 'every release links to its source article');
select col_is_unique('public', 'snack_releases', 'article_url', 'source articles are imported only once');
select ok(has_table_privilege('authenticated', 'public.snack_preferences', 'select'), 'members can read their preferences');
select ok(has_table_privilege('authenticated', 'public.snack_preferences', 'insert'), 'members can create preferences');
select ok(has_table_privilege('authenticated', 'public.snack_releases', 'select'), 'members can read releases');
select ok(not has_table_privilege('authenticated', 'public.snack_releases', 'insert'), 'members cannot publish releases');
select results_eq(
  $$select schedule, active from cron.job where jobname = 'snack-release-feed-refresh'$$,
  $$values ('17 */6 * * *'::text, true)$$,
  'exactly one active snack release refresh runs every six hours'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex.discovery@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('17000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jordan.discovery@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.snacks (id, name, normalized_name, category, source_type, created_by)
values ('27000000-0000-0000-0000-000000000001', 'Discovery Pretzels', 'discovery pretzels', 'Grains/Bakery', 'manual', '17000000-0000-0000-0000-000000000001');

insert into public.snack_preferences (user_id, snack_id, sentiment) values
  ('17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 1),
  ('17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001', -1);
insert into public.snack_releases (title, article_url, published_at)
values ('Discovery Pretzels announced', 'https://example.com/discovery-pretzels', '2026-08-06');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select results_eq('select count(*)::bigint from public.snack_preferences', 'values (1::bigint)', 'members see only their own preferences');
select lives_ok(
  $$insert into public.snack_preferences (user_id, snack_id, sentiment) values ('17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', -1) on conflict (user_id, snack_id) do update set sentiment = excluded.sentiment$$,
  'members can change their own preference'
);
select results_eq($$select count(*)::bigint from public.snack_releases where title = 'Discovery Pretzels announced'$$, 'values (1::bigint)', 'members see published releases');
reset role;

set local role anon;
select throws_ok('select * from public.snack_releases', '42501', null, 'anonymous users cannot read releases');
reset role;

select * from finish();
rollback;
