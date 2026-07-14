begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);

select has_table('public','fantasy_notifications','pick email outbox exists');
select has_function('public','claim_fantasy_notifications',array['integer','timestamp with time zone','uuid'],'sender can lease due rows');
select has_function('public','complete_fantasy_notification',array['uuid','uuid','text'],'sender records provider delivery');
select has_function('public','fail_fantasy_notification',array['uuid','uuid','text','timestamp with time zone'],'sender records retryable failure');
select has_function('public','auto_draft_fantasy_bots',array['timestamp with time zone'],'live bots auto-draft without waiting for the pick clock');
select ok(not has_function_privilege('authenticated','public.claim_fantasy_notifications(integer,timestamp with time zone,uuid)','EXECUTE'),'browser callers cannot claim mail');
select ok(not has_function_privilege('authenticated','public.auto_draft_fantasy_bots(timestamp with time zone)','EXECUTE'),'browser callers cannot run bot drafts');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('14000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','notify'||n||'@carnegiehighered.com','',now(),'{}','{}',now(),now() from generate_series(1,4)n;
update public.feature_flags set enabled=true where key='fantasy_enabled';
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select public.create_fantasy_league('Notify Club');
reset role;
update public.fantasy_leagues set join_code='111111111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true); select public.join_fantasy_league('111111111111111111');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000003',true); select public.join_fantasy_league('111111111111111111');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000004',true); select public.join_fantasy_league('111111111111111111');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
reset role;
select public.start_fantasy_draft((select league_id from public.my_fantasy_leagues() where name='Notify Club'),'2026-07-06 13:00+00');

select is((select count(*) from public.fantasy_notifications),2::bigint,'draft start queues start and reminder mail once');
select is((select count(*) from public.fantasy_notifications where kind='turn_reminder' and due_at='2026-07-06 15:30+00'),1::bigint,'production reminder is due thirty minutes before auto-pick');
select is((select count(*) from public.fantasy_notifications where recipient_user_id=public.fantasy_current_picker((select id from public.fantasy_seasons),1)),2::bigint,'both messages address the active picker');

update auth.users set raw_app_meta_data='{"snack_squad_test_bot":true}'
where id=public.fantasy_current_picker((select id from public.fantasy_seasons),1);
delete from public.fantasy_notifications;
select public.queue_fantasy_turn_notifications((select id from public.fantasy_seasons));
select is((select count(*) from public.fantasy_notifications),0::bigint,'live bots do not receive pick emails');
select is(public.auto_draft_fantasy_bots('2026-07-06 13:00+00'),1,'the bot makes one pick before the next real manager');
select is((select count(*) from public.fantasy_picks),1::bigint,'the bot pick is persisted');
select is((select count(*) from public.fantasy_notifications),2::bigint,'the next real manager receives start and reminder mail');

select * from finish();
rollback;
