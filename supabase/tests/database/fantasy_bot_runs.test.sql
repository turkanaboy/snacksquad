begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(12);

select has_table('public','fantasy_test_runs','named bot runs are persisted');
select has_table('public','fantasy_test_actors','bot identities belong to a run');
select has_column('public','fantasy_leagues','test_run_id','test leagues link to their run');
select has_function('public','create_fantasy_test_run',array['text'],'service role can create a test run');
select has_function('public','register_fantasy_test_actor',array['uuid','uuid'],'service role can register test actors');
select ok(not has_function_privilege('authenticated','public.create_fantasy_test_run(text)','EXECUTE'),'browser users cannot create test runs');
select is(public.before_user_created_hook('{"user":{"email":"bot@snacksquad.test","app_metadata":{"snack_squad_test_bot":true}}}'::jsonb),'{}'::jsonb,'protected bot metadata bypasses the company domain');
select isnt(public.before_user_created_hook('{"user":{"email":"bot@snacksquad.test","user_metadata":{"snack_squad_test_bot":true}}}'::jsonb),'{}'::jsonb,'public user metadata cannot bypass the company domain');
select isnt(public.before_user_created_hook('{"user":{"email":"bot@snacksquad.test","app_metadata":{"snack_squad_test_bot":"malformed"}}}'::jsonb),'{}'::jsonb,'malformed protected metadata denies instead of throwing');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('15000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bot@snacksquad.test','',now(),'{"snack_squad_test_bot":true}','{}',now(),now());
select create_fantasy_test_run('contract-run') as run_id \gset
select register_fantasy_test_actor(:'run_id','15000000-0000-0000-0000-000000000001');
select ok(public.is_fantasy_test_actor('15000000-0000-0000-0000-000000000001'),'registered user is recognized as a test actor');
select is((public.inspect_fantasy_test_run(:'run_id')->>'actorCount')::integer,1,'run inspection reports retained actors');
update public.fantasy_test_runs set status='cleanup_ready' where id=:'run_id';
select lives_ok(format('select public.purge_fantasy_test_data(%L)',:'run_id'),'cleanup retry is idempotent after application data was purged');

select * from finish();
rollback;
