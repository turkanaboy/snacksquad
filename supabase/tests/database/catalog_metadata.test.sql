begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

select has_column('public', 'snacks', 'nutrition_complete', 'catalog stores nutrition completeness');
select has_column('public', 'snacks', 'metadata_verified_at', 'catalog stores moderator verification time');
select has_table('public', 'snack_corrections', 'member correction suggestions are persisted');
select has_function('public', 'upsert_catalog_snack', array['text','text','text','snack_category','text[]','text','text','text','boolean'], 'selected API products can be reused safely');
select has_function('public', 'review_snack_correction', array['uuid','boolean'], 'moderators can review corrections');
select has_function('public', 'merge_snacks', array['uuid','uuid'], 'moderators can merge duplicate snacks transactionally');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex.catalog@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jordan.catalog@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod.catalog@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.upsert_catalog_snack('Cheez-It Original', 'Cheez-It', '024100705509', 'Grains/Bakery', array['en:crackers'], 'https://images.example/cheez-it.jpg', 'https://world.openfoodfacts.org/product/024100705509', 'c', true)$$,
  'authenticated member can reuse a selected API product'
);
select results_eq(
  $$select source_type::text, category::text, nutrition_complete, nutrition_verified from public.snacks where barcode = '024100705509'$$,
  $$values ('open_food_facts'::text, 'Grains/Bakery'::text, true, false)$$,
  'selected API metadata is stored without self-verifying nutrition'
);
select lives_ok(
  $$select public.upsert_catalog_snack('Cheez-It Changed Upstream', 'Cheez-It', '024100705509', 'Other', array['en:snacks'], null, null, null, false)$$,
  'selecting a known barcode reuses the existing canonical snack'
);
select results_eq(
  $$select count(*)::bigint from public.snacks where barcode = '024100705509'$$,
  $$values (1::bigint)$$,
  'known barcode remains one canonical snack'
);
select lives_ok(
  $$insert into public.snack_corrections (id, snack_id, suggested_by, proposed_changes, reason) values ('41000000-0000-0000-0000-000000000001', (select id from public.snacks where barcode = '024100705509'), '11000000-0000-0000-0000-000000000001', '{"name":"Cheez-It Classic"}', 'Package name changed')$$,
  'member can suggest a correction without editing the snack'
);
select throws_ok(
  $$select public.review_snack_correction('41000000-0000-0000-0000-000000000001', true)$$,
  'P0001', 'Moderator access required.',
  'regular member cannot approve a correction'
);
reset role;

insert into public.moderators (user_id) values ('11000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.review_snack_correction('41000000-0000-0000-0000-000000000001', true)$$,
  'moderator can approve a correction'
);
select results_eq(
  $$select name from public.snacks where barcode = '024100705509'$$,
  $$values ('Cheez-It Classic'::text)$$,
  'approved correction updates only canonical metadata'
);
reset role;

insert into public.snacks (id, name, normalized_name, category, source_type, created_by)
values ('21000000-0000-0000-0000-000000000002', 'Cheez It duplicate', 'cheez it duplicate', 'Other', 'manual', '11000000-0000-0000-0000-000000000002');

insert into public.snack_logs (id, user_id, snack_id, logged_at)
values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', (select id from public.snacks where barcode = '024100705509'), now()),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', now()),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', now());
insert into public.log_upvotes (log_id, user_id) values
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001');
update public.profiles set favorite_snack_id = '21000000-0000-0000-0000-000000000002' where user_id = '11000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.merge_snacks((select id from public.snacks where barcode = '024100705509'), '21000000-0000-0000-0000-000000000002')$$,
  'moderator can merge duplicate canonical snacks'
);
reset role;

select results_eq(
  $$select count(*)::bigint from public.snacks where id = '21000000-0000-0000-0000-000000000002' and merged_into_id = (select id from public.snacks where barcode = '024100705509')$$,
  $$values (1::bigint)$$,
  'duplicate remains as a merge tombstone'
);
select results_eq(
  $$select count(*)::bigint from public.snack_logs where snack_id = (select id from public.snacks where barcode = '024100705509')$$,
  $$values (2::bigint)$$,
  'merge resolves same-user daily conflicts while preserving distinct logs'
);
select results_eq(
  $$select count(*)::bigint from public.log_upvotes u join public.snack_logs l on l.id = u.log_id where l.snack_id = (select id from public.snacks where barcode = '024100705509')$$,
  $$values (2::bigint)$$,
  'merge preserves valid entry upvotes'
);
select results_eq(
  $$select count(*)::bigint from public.profiles where user_id = '11000000-0000-0000-0000-000000000002' and favorite_snack_id = (select id from public.snacks where barcode = '024100705509')$$,
  $$values (1::bigint)$$,
  'merge redirects favorite snack references'
);

select * from finish();
rollback;
