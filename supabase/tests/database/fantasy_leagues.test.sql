begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(48);

select has_table('public','fantasy_leagues','fantasy leagues are persisted');
select has_table('public','fantasy_league_members','private league membership is persisted');
select has_table('public','fantasy_seasons','monthly seasons are persisted');
select has_table('public','fantasy_draft_order','random draft order is persisted');
select has_table('public','fantasy_preferences','auto-pick preferences are persisted');
select has_table('public','fantasy_picks','draft picks are immutable history');
select has_table('public','fantasy_roster_slots','effective roster intervals support scoring and waivers');
select has_table('public','fantasy_waivers','one Friday waiver is auditable');
select has_function('public','create_fantasy_league',array['text'],'members can create gated leagues');
select has_function('public','join_fantasy_league',array['text'],'opaque codes join private leagues');
select has_function('public','start_fantasy_draft',array['uuid','date','timestamp with time zone'],'league creators start monthly drafts');
select has_function('public','submit_fantasy_pick',array['uuid','uuid','timestamp with time zone'],'on-clock managers submit picks');
select has_function('public','set_fantasy_preferences',array['uuid','uuid[]'],'managers rank auto-pick preferences');
select has_function('public','submit_fantasy_waiver',array['uuid','uuid','uuid','timestamp with time zone'],'Friday waiver is explicit');
select has_function('public','fantasy_standings',array['uuid'],'fantasy points derive from source activity');
select has_function('public','reconcile_fantasy',array['timestamp with time zone'],'expired clocks and seasons reconcile idempotently');
select ok(not has_function_privilege('authenticated','public.start_fantasy_draft(uuid,date,timestamp with time zone)','EXECUTE'),'authenticated callers cannot spoof draft time');
select ok(not has_function_privilege('authenticated','public.submit_fantasy_pick(uuid,uuid,timestamp with time zone)','EXECUTE'),'authenticated callers cannot spoof pick time');
select ok(not has_function_privilege('authenticated','public.submit_fantasy_waiver(uuid,uuid,uuid,timestamp with time zone)','EXECUTE'),'authenticated callers cannot spoof waiver time');
select ok(has_function_privilege('authenticated','public.start_fantasy_draft(uuid,date)','EXECUTE'),'authenticated callers can use the server-clock draft wrapper');
select ok(has_function_privilege('authenticated','public.submit_fantasy_pick(uuid,uuid)','EXECUTE'),'authenticated callers can use the server-clock pick wrapper');
select ok(has_function_privilege('authenticated','public.submit_fantasy_waiver(uuid,uuid,uuid)','EXECUTE'),'authenticated callers can use the server-clock waiver wrapper');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('13000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fantasy'||n||'@carnegiehighered.com','',now(),'{}','{}',now(),now() from generate_series(1,4)n;

set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select throws_ok($$select * from public.create_fantasy_league('Locked')$$,'P0001','Fantasy is locked for the pilot.','disabled fantasy rejects writes');
reset role;

select results_eq($$select public.fantasy_add_business_hours('2026-07-06 13:00+00',3)$$,$$values('2026-07-06 16:00+00'::timestamptz)$$,'three Monday business hours remain Monday');
select results_eq($$select public.fantasy_add_business_hours('2026-07-03 20:00+00',3)$$,$$values('2026-07-06 15:00+00'::timestamptz)$$,'Friday clock pauses overnight and through the weekend');
select results_eq($$select public.fantasy_add_business_hours('2026-07-04 14:00+00',3)$$,$$values('2026-07-06 16:00+00'::timestamptz)$$,'weekend manual start receives a Monday noon deadline');

update public.feature_flags set enabled=true where key='fantasy_enabled';
insert into public.snacks(name,normalized_name,category,source_type,created_by)
select category||' '||n,lower(category||' '||n),category::public.snack_category,'manual','13000000-0000-0000-0000-000000000001'
from unnest(array['Grains/Bakery','Protein','Dairy','Fruit','Vegetables']) category cross join generate_series(1,8)n;

set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select lives_ok($$select * from public.create_fantasy_league('Crunch Club')$$,'enabled member creates a league');
reset role;
update public.fantasy_leagues set join_code='abcdefabcdefabcdef' where name='Crunch Club';
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.join_fantasy_league('abcdefabcdefabcdef')$$,'second manager joins with opaque code');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.join_fantasy_league('abcdefabcdefabcdef')$$,'third manager joins');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.join_fantasy_league('abcdefabcdefabcdef')$$,'fourth manager joins');
reset role;
select is((select count(*)::bigint from public.fantasy_league_members),4::bigint,'league has four managers');

select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.start_fantasy_draft((select league_id from public.my_fantasy_leagues() where name='Crunch Club'),'2026-07-01','2026-07-01 13:00+00')$$,'creator starts a catalog-safe draft');
select is((select count(*)::bigint from public.fantasy_draft_order),4::bigint,'all managers receive a draft position');
select is((select count(distinct position)::bigint from public.fantasy_draft_order),4::bigint,'draft positions are unique');
select is((select public.fantasy_current_picker(id,1) from public.fantasy_seasons),(select user_id from public.fantasy_draft_order where position=1),'pick one uses position one');
select is((select public.fantasy_current_picker(id,4) from public.fantasy_seasons),(select user_id from public.fantasy_draft_order where position=4),'pick four uses position four');
select is((select public.fantasy_current_picker(id,5) from public.fantasy_seasons),(select user_id from public.fantasy_draft_order where position=4),'snake turn repeats the last manager');
select is((select public.fantasy_current_picker(id,8) from public.fantasy_seasons),(select user_id from public.fantasy_draft_order where position=1),'second round ends back at position one');

select set_config('request.jwt.claim.sub',(select public.fantasy_current_picker(id,1)::text from public.fantasy_seasons),true);
select lives_ok($$select public.submit_fantasy_pick((select id from public.fantasy_seasons),(select id from public.snacks order by normalized_name limit 1),'2026-07-01 14:00+00')$$,'on-clock manager drafts manually');
select is((select count(*)::bigint from public.fantasy_picks),1::bigint,'manual pick is persisted once');
select lives_ok($$select public.auto_pick_fantasy((select id from public.fantasy_seasons),(select pick_deadline from public.fantasy_seasons))$$,'expired next pick falls back to the leaderboard catalog');
select is((select count(*)::bigint from public.fantasy_picks where was_auto_pick),1::bigint,'auto-pick is marked in history');

update public.fantasy_seasons set status='active',scoring_starts_at='2026-07-01 13:00+00',pick_deadline=null where true;
insert into public.snack_logs(id,user_id,snack_id,logged_at) values
('33000000-0000-0000-0000-000000000001',(select user_id from public.fantasy_picks order by pick_number limit 1),(select snack_id from public.fantasy_picks order by pick_number limit 1),'2026-07-02 14:00+00'),
('33000000-0000-0000-0000-000000000002',(select user_id from public.fantasy_draft_order where user_id<>(select user_id from public.fantasy_picks order by pick_number limit 1) order by position limit 1),(select snack_id from public.fantasy_picks order by pick_number limit 1),'2026-07-02 14:00+00');
insert into public.log_upvotes(log_id,user_id) values
('33000000-0000-0000-0000-000000000002',(select user_id from public.fantasy_draft_order where user_id not in ((select user_id from public.fantasy_picks order by pick_number limit 1),(select user_id from public.snack_logs where id='33000000-0000-0000-0000-000000000002')) order by position limit 1)),
('33000000-0000-0000-0000-000000000002',(select user_id from public.fantasy_picks order by pick_number limit 1));
select is((select points from public.fantasy_standings((select id from public.fantasy_seasons)) where user_id=(select user_id from public.fantasy_picks order by pick_number limit 1)),2::bigint,'manager own log and upvote do not score');

select set_config('request.jwt.claim.sub',(select user_id::text from public.fantasy_picks order by pick_number limit 1),true);
select lives_ok($$select public.submit_fantasy_waiver((select id from public.fantasy_seasons),(select snack_id from public.fantasy_picks order by pick_number limit 1),(select s.id from public.snacks s join public.fantasy_picks p on p.category=s.category where p.pick_number=1 and not exists(select 1 from public.fantasy_picks used where used.snack_id=s.id) order by s.normalized_name limit 1),'2026-07-03 16:00+00')$$,'Friday waiver preserves category and exclusivity');
select is((select count(*)::bigint from public.fantasy_waivers),1::bigint,'waiver is recorded once');
select set_config('request.jwt.claim.sub',(select user_id::text from public.fantasy_picks order by pick_number limit 1),true);
select throws_ok($$select public.submit_fantasy_waiver((select id from public.fantasy_seasons),(select snack_id from public.fantasy_roster_slots where effective_to is null and user_id=auth.uid() limit 1),(select id from public.snacks where category=(select category from public.fantasy_roster_slots where effective_to is null and user_id=auth.uid() limit 1) limit 1),'2026-07-03 17:00+00')$$,'P0001','Friday waiver already used.','manager cannot use a second waiver');
set local role anon;
select throws_ok($$select * from public.fantasy_leagues$$,'42501',null,'anonymous role cannot read fantasy tables');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select is((public.fantasy_feature_state()->>'enabled')::boolean,true,'feature state reports the operational unlock');
select * from finish();
rollback;
