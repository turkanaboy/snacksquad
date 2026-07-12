begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(8);

select is((select count(*) from public.fantasy_fallback_products),40::bigint,'reserve contains forty products');
select is((select min(products) from (select count(*) products from public.fantasy_fallback_products group by category) counts),8::bigint,'every reserve category contains eight products');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('16000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','reserve'||n||'@carnegiehighered.com','',now(),'{}','{}',now(),now() from generate_series(1,8)n;
select set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000001',true);
select public.create_fantasy_league('Reserve League');
update public.fantasy_leagues set join_code='222222222222222222';
do $$ begin
  for n in 2..8 loop
    perform set_config('request.jwt.claim.sub',('16000000-0000-0000-0000-'||lpad(n::text,12,'0')),true);
    perform public.join_fantasy_league('222222222222222222');
  end loop;
end $$;
select set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000001',true);
select public.start_fantasy_draft((select id from public.fantasy_leagues),'2026-07-06 13:00+00');
do $$ declare season_id uuid; begin
  select id into season_id from public.fantasy_seasons;
  for n in 1..40 loop perform public.auto_pick_fantasy(season_id,(select pick_deadline from public.fantasy_seasons where id=season_id)); end loop;
end $$;

select is((select count(*) from public.fantasy_picks),40::bigint,'eight-manager empty-catalog draft completes forty picks');
select is((select count(*) from public.fantasy_fallback_products where materialized_snack_id is not null),40::bigint,'all reserve products materialize only when needed');
select is((select min(categories) from (select count(distinct category) categories from public.fantasy_picks group by user_id) rosters),5::bigint,'every manager receives five distinct categories');
select public.reconcile_fantasy((select scoring_ends_at from public.fantasy_seasons));
select is((select status::text from public.fantasy_seasons),'complete','two-week season reconciles to complete');
select is((select count(*) from public.badge_tenures tenure join public.badge_definitions definition on definition.id=tenure.badge_definition_id where definition.key='fantasy-champion'),8::bigint,'every first-place tie receives the champion award');
select public.start_fantasy_draft((select id from public.fantasy_leagues),'2026-07-20 13:00+00');
select is((select max(season_number) from public.fantasy_seasons),2,'creator can start the next numbered season');

select * from finish();
rollback;
