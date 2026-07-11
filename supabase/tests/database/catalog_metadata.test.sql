begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

select has_column('public', 'snacks', 'nutrition_complete', 'catalog stores nutrition completeness');
select has_column('public', 'snacks', 'metadata_verified_at', 'catalog stores moderator verification time');
select has_table('public', 'snack_corrections', 'member correction suggestions are persisted');
select has_function('public', 'upsert_catalog_snack', array['text','text','text','snack_category','text[]','text','text','text','boolean'], 'selected API products can be reused safely');
select has_function('public', 'import_catalog_snack', array['text','text','text','snack_category','text[]','text','text','boolean','uuid'], 'trusted catalog imports use a service-only function');
select has_function('public', 'review_snack_correction', array['uuid','boolean'], 'moderators can review corrections');
select has_function('public', 'merge_snacks', array['uuid','uuid'], 'moderators can merge duplicate snacks transactionally');
select ok(
  not has_function_privilege('authenticated', 'public.upsert_catalog_snack(text,text,text,public.snack_category,text[],text,text,text,boolean)', 'execute'),
  'members cannot forge provider-backed catalog records'
);
select ok(
  has_function_privilege('service_role', 'public.import_catalog_snack(text,text,text,public.snack_category,text[],text,text,boolean,uuid)', 'execute'),
  'service role can persist verified provider metadata'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex.catalog@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jordan.catalog@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod.catalog@carnegiehighered.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role service_role;
select lives_ok(
  $$select public.import_catalog_snack('Cheez-It Original', 'Cheez-It', '024100705509', 'Grains/Bakery', array['Crackers'], null, 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/1/nutrients', true, '11000000-0000-0000-0000-000000000001')$$,
  'service import persists a verified API product'
);
reset role;
select results_eq(
  $$select source_type::text, category::text, nutrition_complete, nutrition_verified from public.snacks where barcode = '00024100705509'$$,
  $$values ('usda'::text, 'Grains/Bakery'::text, true, false)$$,
  'selected API metadata is stored without self-verifying nutrition'
);
set local role service_role;
select lives_ok(
  $$select public.import_catalog_snack('Cheez-It Changed Upstream', 'Cheez-It', '00024100705509', 'Other', array['Crackers'], null, 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/1/nutrients', false, '11000000-0000-0000-0000-000000000001')$$,
  'equivalent UPC and GTIN-14 values reuse the existing canonical snack'
);
reset role;
select results_eq(
  $$select count(*)::bigint from public.snacks where barcode = '00024100705509'$$,
  $$values (1::bigint)$$,
  'known barcode remains one canonical snack'
);
set local role service_role;
select lives_ok(
  $$select public.import_catalog_snack('USDA Apple', null, null, 'Fruit', array['Apples'], null, 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/2/nutrients', false, '11000000-0000-0000-0000-000000000001'); select public.import_catalog_snack('USDA Apple Renamed', null, null, 'Fruit', array['Apples'], null, 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/2/nutrients', false, '11000000-0000-0000-0000-000000000001')$$,
  'unbarcoded provider products can be imported repeatedly'
);
reset role;
select results_eq(
  $$select count(*)::bigint from public.snacks where source_url = 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/2/nutrients'$$,
  $$values (1::bigint)$$,
  'provider source identity prevents duplicate unbarcoded snacks'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into public.snacks (name, normalized_name, barcode, category, source_type, created_by) values ('Manual UPC', 'manual upc', '12345678', 'Other', 'manual', '11000000-0000-0000-0000-000000000001')$$,
  'manual catalog writes accept a valid short GTIN'
);
select results_eq(
  $$select barcode from public.snacks where normalized_name = 'manual upc'$$,
  $$values ('00000012345678'::text)$$,
  'all catalog writers store canonical GTIN-14 values'
);
select lives_ok(
  $$insert into public.snack_corrections (id, snack_id, suggested_by, proposed_changes, reason) values ('41000000-0000-0000-0000-000000000001', (select id from public.snacks where barcode = '00024100705509'), '11000000-0000-0000-0000-000000000001', '{"name":"Cheez-It Classic"}', 'Package name changed')$$,
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
  $$select name from public.snacks where barcode = '00024100705509'$$,
  $$values ('Cheez-It Classic'::text)$$,
  'approved correction updates only canonical metadata'
);
reset role;

insert into public.snacks (id, name, normalized_name, category, source_type, created_by)
values ('21000000-0000-0000-0000-000000000002', 'Cheez It duplicate', 'cheez it duplicate', 'Other', 'manual', '11000000-0000-0000-0000-000000000002');

insert into public.snack_logs (id, user_id, snack_id, logged_at)
values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', (select id from public.snacks where barcode = '00024100705509'), now()),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', now()),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', now());
insert into public.log_upvotes (log_id, user_id) values
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001');
update public.profiles set favorite_snack_id = '21000000-0000-0000-0000-000000000002' where user_id = '11000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.merge_snacks((select id from public.snacks where barcode = '00024100705509'), '21000000-0000-0000-0000-000000000002')$$,
  'moderator can merge duplicate canonical snacks'
);
reset role;

select results_eq(
  $$select count(*)::bigint from public.snacks where id = '21000000-0000-0000-0000-000000000002' and merged_into_id = (select id from public.snacks where barcode = '00024100705509')$$,
  $$values (1::bigint)$$,
  'duplicate remains as a merge tombstone'
);
select results_eq(
  $$select count(*)::bigint from public.snack_logs where snack_id = (select id from public.snacks where barcode = '00024100705509')$$,
  $$values (2::bigint)$$,
  'merge resolves same-user daily conflicts while preserving distinct logs'
);
select results_eq(
  $$select count(*)::bigint from public.log_upvotes u join public.snack_logs l on l.id = u.log_id where l.snack_id = (select id from public.snacks where barcode = '00024100705509')$$,
  $$values (2::bigint)$$,
  'merge preserves valid entry upvotes'
);
select results_eq(
  $$select count(*)::bigint from public.profiles where user_id = '11000000-0000-0000-0000-000000000002' and favorite_snack_id = (select id from public.snacks where barcode = '00024100705509')$$,
  $$values (1::bigint)$$,
  'merge redirects favorite snack references'
);

insert into public.snacks (id, name, normalized_name, category, source_type, created_by)
values ('21000000-0000-0000-0000-000000000003', 'Protected duplicate', 'protected duplicate', 'Other', 'manual', '11000000-0000-0000-0000-000000000002');
insert into public.bracket_weeks (id, week_start, nomination_opens_at, nomination_closes_at, results_publish_at)
values ('42000000-0000-0000-0000-000000000003', '2030-01-07', '2030-01-02 09:00-05', '2030-01-07 09:00-05', '2030-01-11 09:00-05');
insert into public.bracket_entries (week_id, snack_id)
values ('42000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.merge_snacks((select id from public.snacks where barcode = '00024100705509'), '21000000-0000-0000-0000-000000000003')$$,
  'P0001', 'Snack is used by competition history and cannot be merged.',
  'merge refuses to corrupt immutable competition references'
);
reset role;

select * from finish();
rollback;
