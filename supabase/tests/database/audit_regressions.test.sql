begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('19000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit'||n||'@carnegiehighered.com','',now(),'{}','{}',now(),now() from generate_series(1,5)n;
insert into public.snacks(id,name,normalized_name,category,source_type,created_by)
select ('29000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Audit snack '||n,'audit snack '||n,'Fruit','manual','19000000-0000-0000-0000-000000000001' from generate_series(1,40)n;
insert into public.snack_logs(id,user_id,snack_id,logged_at,rating)
select ('39000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'19000000-0000-0000-0000-000000000001',('29000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now(),4 from generate_series(1,31)n;

select ok(not has_column_privilege('authenticated','public.snack_logs','logged_at','INSERT'),'member cannot insert a scoring timestamp');
select ok(not has_column_privilege('authenticated','public.snack_logs','logged_at','UPDATE'),'member cannot update a scoring timestamp');
select ok(not has_column_privilege('authenticated','public.log_upvotes','created_at','INSERT'),'member cannot supply an upvote timestamp');
select ok(has_column_privilege('service_role','public.snack_logs','logged_at','INSERT'),'service fixtures retain historical insertion');
select ok(not has_function_privilege('anon','public.board_feed_page(integer,timestamptz,uuid)','EXECUTE'),'anonymous callers cannot page the feed');

set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000002',true);
select throws_ok($$insert into public.snack_logs(user_id,snack_id,logged_at,rating) values(auth.uid(),'29000000-0000-0000-0000-000000000032',now()-interval '1 day',5)$$,'42501',null,'backdated member log is rejected');
select throws_ok($$insert into public.snack_logs(user_id,snack_id,logged_at,rating) values(auth.uid(),'29000000-0000-0000-0000-000000000032',now()+interval '1 day',5)$$,'42501',null,'future member log is rejected');
select throws_ok($$insert into public.log_upvotes(log_id,user_id,created_at) values('39000000-0000-0000-0000-000000000001',auth.uid(),now()-interval '1 day')$$,'42501',null,'backdated member upvote is rejected');
select lives_ok($$insert into public.snack_logs(user_id,snack_id,rating,rating_source) values(auth.uid(),'29000000-0000-0000-0000-000000000032',5,'user')$$,'member can log with a server timestamp');
select lives_ok($$update public.snack_logs set rating=2,rating_source='user' where user_id=auth.uid()$$,'member can edit their same-day rating');
select throws_ok($$update public.snack_logs set logged_at=now() where user_id=auth.uid()$$,'42501',null,'timestamp updates are rejected even for the owner');
select lives_ok($$insert into public.log_upvotes(log_id,user_id) values('39000000-0000-0000-0000-000000000001',auth.uid())$$,'normal upvote still works');
select results_eq($$select count(*) from public.board_feed_page(30,null,null)$$,$$values (30::bigint)$$,'first feed page is full');
select results_eq($$with first_page as (select * from public.board_feed_page(30,null,null)), last_row as (select * from first_page order by logged_at,log_id limit 1) select count(*) from last_row cross join lateral public.board_feed_page(30,last_row.logged_at,last_row.log_id)$$,$$values (2::bigint)$$,'remaining equal-timestamp entries appear on page two');
select results_eq($$select poster_rating_source from public.board_feed_page(100,null,null) where log_id='39000000-0000-0000-0000-000000000001'$$,$$values ('legacy_unknown'::text)$$,'unattributed scores retain unknown provenance');
select results_eq($$select rating_source from public.snack_logs where user_id=auth.uid()$$,$$values ('user'::text)$$,'explicit member scores are marked user-supplied');
reset role;

insert into public.snack_preferences(user_id,snack_id,sentiment,updated_at) values
('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000033',1,now()),
('19000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000034',-1,now()-interval '1 day'),
('19000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000034',-1,now());
insert into public.moderators(user_id) values('19000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.merge_snacks('29000000-0000-0000-0000-000000000033','29000000-0000-0000-0000-000000000034')$$,'moderator merge handles saved snack preferences');
select results_eq($$select sentiment::integer from public.snack_preferences where user_id=auth.uid()$$,$$values (1)$$,'newer survivor sentiment wins');
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000002',true);
select results_eq($$select p.sentiment::integer from public.snack_preferences p join public.snacks s on s.id=p.snack_id$$,$$values (-1)$$,'other member preference remains visible after merge');
reset role;
select results_eq($$select count(*) from public.snack_preferences where snack_id='29000000-0000-0000-0000-000000000034'$$,$$values (0::bigint)$$,'merged duplicate has no stranded preferences');

update public.feature_flags set enabled=true where key='fantasy_enabled';
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000001',true);
create temporary table audit_league as select * from public.create_fantasy_league('Audit queue league');
grant select on audit_league to authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000002',true);
select public.join_fantasy_league(join_code) from audit_league;
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000003',true);
select public.join_fantasy_league(join_code) from audit_league;
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000004',true);
select public.join_fantasy_league(join_code) from audit_league;
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000001',true);
create temporary table audit_season as select public.start_fantasy_draft(league_id) as id from audit_league;
grant select on audit_season to authenticated;
set local role authenticated;
select public.set_fantasy_preferences(id,array['29000000-0000-0000-0000-000000000002'::uuid,'29000000-0000-0000-0000-000000000001'::uuid]) from audit_season;
select results_eq($$select public.fantasy_overview(league_id)->'preferences'->0->>'id' from audit_league$$,$$values ('29000000-0000-0000-0000-000000000002'::text)$$,'saved queue returns in rank order');
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000002',true);
select results_eq($$select jsonb_array_length(public.fantasy_overview(league_id)->'preferences') from audit_league$$,$$values (0)$$,'another manager cannot read the first manager queue');
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000001',true);
select public.set_fantasy_preferences(id,'{}'::uuid[]) from audit_season;
select results_eq($$select public.fantasy_overview(league_id)->'preferences' from audit_league$$,$$values ('[]'::jsonb)$$,'empty saved queue persists');
select set_config('request.jwt.claim.sub','19000000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.fantasy_overview(league_id) from audit_league$$,'P0001','Not a league member.','nonmember still cannot read overview');
reset role;
select * from finish();
rollback;
