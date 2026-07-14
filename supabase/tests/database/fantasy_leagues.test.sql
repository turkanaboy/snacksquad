begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(51);

select has_table('public','fantasy_leagues','fantasy leagues are persisted');
select has_table('public','fantasy_league_members','private league membership is persisted');
select has_table('public','fantasy_seasons','numbered seasons are persisted');
select has_column('public','fantasy_seasons','season_number','seasons are numbered per league');
select has_table('public','fantasy_draft_order','random draft order is persisted');
select has_table('public','fantasy_preferences','auto-pick preferences are persisted');
select has_table('public','fantasy_picks','draft picks are immutable history');
select has_table('public','fantasy_roster_slots','effective roster intervals support scoring and waivers');
select hasnt_table('public','fantasy_waivers','fixed rosters have no waiver storage');
select has_function('public','create_fantasy_league',array['text'],'members can create gated leagues');
select has_function('public','join_fantasy_league',array['text'],'opaque codes join private leagues');
select has_function('public','start_fantasy_draft',array['uuid','timestamp with time zone'],'league creators start numbered drafts');
select has_function('public','submit_fantasy_pick',array['uuid','uuid','timestamp with time zone'],'on-clock managers submit picks');
select has_function('public','set_fantasy_preferences',array['uuid','uuid[]'],'managers rank auto-pick preferences');
select hasnt_function('public','submit_fantasy_waiver',array['uuid','uuid','uuid','timestamp with time zone'],'timestamp waiver API is removed');
select hasnt_function('public','submit_fantasy_waiver',array['uuid','uuid','uuid'],'server-clock waiver API is removed');
select has_function('public','fantasy_standings',array['uuid'],'fantasy points derive from source activity');
select has_function('public','reconcile_fantasy',array['timestamp with time zone'],'expired clocks and seasons reconcile idempotently');
select ok(not has_function_privilege('authenticated','public.start_fantasy_draft(uuid,timestamp with time zone)','EXECUTE'),'authenticated callers cannot spoof draft time');
select ok(not has_function_privilege('authenticated','public.submit_fantasy_pick(uuid,uuid,timestamp with time zone)','EXECUTE'),'authenticated callers cannot spoof pick time');
select ok(has_function_privilege('authenticated','public.start_fantasy_draft(uuid)','EXECUTE'),'authenticated callers can use the server-clock draft wrapper');
select ok(has_function_privilege('authenticated','public.submit_fantasy_pick(uuid,uuid)','EXECUTE'),'authenticated callers can use the server-clock pick wrapper');
select throws_ok($$select public.submit_fantasy_pick('00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid)$$,'P0001','Authentication required.','browser-facing pick RPC resolves uniquely');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('13000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fantasy'||n||'@carnegiehighered.com','',now(),'{}','{}',now(),now() from generate_series(1,4)n;

update public.feature_flags set enabled=false where key='fantasy_enabled';
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select throws_ok($$select * from public.create_fantasy_league('Locked')$$,'P0001','Fantasy is locked for the pilot.','disabled fantasy rejects writes');
reset role;

select results_eq($$select public.fantasy_add_business_hours('2026-07-06 13:00+00',3)$$,$$values('2026-07-06 16:00+00'::timestamptz)$$,'three Monday business hours remain Monday');
select results_eq($$select public.fantasy_add_business_hours('2026-07-03 20:00+00',3)$$,$$values('2026-07-06 15:00+00'::timestamptz)$$,'Friday clock pauses overnight and through the weekend');
select results_eq($$select public.fantasy_add_business_hours('2026-07-04 14:00+00',3)$$,$$values('2026-07-06 16:00+00'::timestamptz)$$,'weekend manual start receives a Monday noon deadline');
select results_eq($$select public.fantasy_next_monday('2026-07-06 14:00+00')$$,$$values('2026-07-13 04:00+00'::timestamptz)$$,'Monday completion starts scoring the following Monday');
select results_eq($$select public.fantasy_next_monday('2026-07-10 20:00+00')$$,$$values('2026-07-13 04:00+00'::timestamptz)$$,'Friday completion starts scoring the next Monday');
select results_eq($$select public.fantasy_next_monday('2026-07-12 14:00+00')$$,$$values('2026-07-13 04:00+00'::timestamptz)$$,'Sunday completion starts scoring the next Monday');

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
select lives_ok($$select public.start_fantasy_draft((select league_id from public.my_fantasy_leagues() where name='Crunch Club'),'2026-07-01 13:00+00')$$,'creator starts a numbered draft');
select is((select season_number from public.fantasy_seasons),1,'first league season is numbered one');
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

update public.fantasy_seasons set status='active',scoring_starts_at='2026-07-01 13:00+00',scoring_ends_at='2026-07-15 04:00+00',pick_deadline=null where true;
insert into public.snack_logs(id,user_id,snack_id,logged_at) values
('33000000-0000-0000-0000-000000000001',(select user_id from public.fantasy_picks order by pick_number limit 1),(select snack_id from public.fantasy_picks order by pick_number limit 1),'2026-07-02 14:00+00'),
('33000000-0000-0000-0000-000000000002',(select user_id from public.fantasy_draft_order where user_id<>(select user_id from public.fantasy_picks order by pick_number limit 1) order by position limit 1),(select snack_id from public.fantasy_picks order by pick_number limit 1),'2026-07-02 14:00+00'),
('33000000-0000-0000-0000-000000000003',(select user_id from public.fantasy_draft_order where user_id<>(select user_id from public.fantasy_picks order by pick_number limit 1) order by position limit 1),(select snack_id from public.fantasy_picks order by pick_number limit 1),'2026-07-04 14:00+00');
insert into public.log_upvotes(log_id,user_id,created_at) values
('33000000-0000-0000-0000-000000000002',(select user_id from public.fantasy_draft_order where user_id not in ((select user_id from public.fantasy_picks order by pick_number limit 1),(select user_id from public.snack_logs where id='33000000-0000-0000-0000-000000000002')) order by position limit 1),'2026-07-02 15:00+00'),
('33000000-0000-0000-0000-000000000002',(select user_id from public.fantasy_picks order by pick_number limit 1),'2026-07-02 15:00+00');
select is((select points from public.fantasy_standings((select id from public.fantasy_seasons)) where user_id=(select user_id from public.fantasy_picks order by pick_number limit 1)),2::bigint,'manager own log and upvote do not score');
select is((select points from public.fantasy_standings((select id from public.fantasy_seasons)) where user_id=(select user_id from public.fantasy_picks order by pick_number limit 1)),2::bigint,'Saturday activity does not score');
set local role anon;
select throws_ok($$select * from public.fantasy_leagues$$,'42501',null,'anonymous role cannot read fantasy tables');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select is((public.fantasy_feature_state()->>'enabled')::boolean,true,'feature state reports the operational unlock');
select * from finish();
rollback;
