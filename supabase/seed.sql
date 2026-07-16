-- Demo/development data for the Supabase SQL Editor or `supabase db reset --local`.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  crypt('snacksquad', gen_salt('bf')), now() - interval '35 days',
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('email', email, 'email_verified', true),
  now() - interval '35 days', now() - interval '35 days'
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'alex.morgan@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'jordan.lee@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'priya.shah@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'marcus.chen@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'taylor.brooks@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'sam.rivera@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'morgan.patel@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'casey.nguyen@carnegiehighered.com')
) users(id, email)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  id, id, email,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now() - interval '1 day', now() - interval '35 days', now() - interval '1 day'
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'alex.morgan@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'jordan.lee@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'priya.shah@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'marcus.chen@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'taylor.brooks@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'sam.rivera@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'morgan.patel@carnegiehighered.com'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'casey.nguyen@carnegiehighered.com')
) users(id, email)
on conflict (provider_id, provider) do nothing;

insert into public.snacks (
  id, name, normalized_name, brand, barcode, category, source_type, source_categories,
  source_url, nutri_score, nutrition_complete, nutrition_verified, metadata_verified_at, created_by, created_at
)
select
  id, name, lower(name), brand, lpad((10000000 + ordinal)::text, 14, '0'), category, 'usda',
  array[category::text],
  'https://fdc.nal.usda.gov/fdc-app.html#/food-details/' || (100000 + ordinal)::text || '/nutrients',
  nutri_score, true, true, now() - interval '30 days',
  '10000000-0000-0000-0000-000000000001', now() - interval '34 days'
from (values
  (1,  '20000000-0000-0000-0000-000000000001'::uuid, 'Sea Salt Popcorn', 'LesserEvil', 'Chips/Savory Snacks'::public.snack_category, 'b'),
  (2,  '20000000-0000-0000-0000-000000000002'::uuid, 'Peanut Butter Pretzels', 'Snyder''s', 'Grains/Bakery'::public.snack_category, 'c'),
  (3,  '20000000-0000-0000-0000-000000000003'::uuid, 'Honeycrisp Apple', 'Fresh', 'Fruit'::public.snack_category, 'a'),
  (4,  '20000000-0000-0000-0000-000000000004'::uuid, 'Greek Yogurt', 'Chobani', 'Dairy'::public.snack_category, 'a'),
  (5,  '20000000-0000-0000-0000-000000000005'::uuid, 'Dark Chocolate Almonds', 'SkinnyDipped', 'Candy/Sweets'::public.snack_category, 'd'),
  (6,  '20000000-0000-0000-0000-000000000006'::uuid, 'Spicy Trail Mix', 'Kar''s', 'Protein'::public.snack_category, 'c'),
  (7,  '20000000-0000-0000-0000-000000000007'::uuid, 'Cheddar Crackers', 'Cheez-It', 'Grains/Bakery'::public.snack_category, 'd'),
  (8,  '20000000-0000-0000-0000-000000000008'::uuid, 'Sparkling Water', 'Spindrift', 'Beverages'::public.snack_category, 'a'),
  (9,  '20000000-0000-0000-0000-000000000009'::uuid, 'Baby Carrots', 'Fresh', 'Vegetables'::public.snack_category, 'a'),
  (10, '20000000-0000-0000-0000-000000000010'::uuid, 'Salted Cashews', 'Planters', 'Protein'::public.snack_category, 'b'),
  (11, '20000000-0000-0000-0000-000000000011'::uuid, 'Chocolate Chip Granola Bar', 'MadeGood', 'Grains/Bakery'::public.snack_category, 'c'),
  (12, '20000000-0000-0000-0000-000000000012'::uuid, 'Nacho Cheese Chips', 'Doritos', 'Chips/Savory Snacks'::public.snack_category, 'e'),
  (13, '20000000-0000-0000-0000-000000000013'::uuid, 'Strawberry Fruit Bar', 'That''s It', 'Fruit'::public.snack_category, 'a'),
  (14, '20000000-0000-0000-0000-000000000014'::uuid, 'Mini Peanut Butter Cups', 'Reese''s', 'Candy/Sweets'::public.snack_category, 'e'),
  (15, '20000000-0000-0000-0000-000000000015'::uuid, 'String Cheese', 'Sargento', 'Dairy'::public.snack_category, 'b'),
  (16, '20000000-0000-0000-0000-000000000016'::uuid, 'Everything Hummus', 'Sabra', 'Vegetables'::public.snack_category, 'b')
) snacks(ordinal, id, name, brand, category, nutri_score)
on conflict (id) do nothing;

update public.profiles p
set display_name = u.display_name,
    favorite_snack_id = u.favorite_snack_id,
    created_at = now() - interval '35 days',
    updated_at = now() - interval '1 day'
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'Alex Morgan', '20000000-0000-0000-0000-000000000001'::uuid),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'Jordan Lee', '20000000-0000-0000-0000-000000000008'::uuid),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'Priya Shah', '20000000-0000-0000-0000-000000000011'::uuid),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'Marcus Chen', '20000000-0000-0000-0000-000000000004'::uuid),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'Taylor Brooks', '20000000-0000-0000-0000-000000000013'::uuid),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'Sam Rivera', '20000000-0000-0000-0000-000000000006'::uuid),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'Morgan Patel', '20000000-0000-0000-0000-000000000015'::uuid),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'Casey Nguyen', '20000000-0000-0000-0000-000000000003'::uuid)
) u(id, display_name, favorite_snack_id)
where p.user_id = u.id;

insert into public.moderators (user_id)
values ('10000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

-- Roughly one hundred logs over four weeks. The newest week has all eight people;
-- earlier weeks have six, so the locked Fantasy pilot meter also looks realistic.
insert into public.snack_logs (id, user_id, snack_id, logged_at, created_at)
select
  md5(u.id::text || ':' || day_offset::text)::uuid,
  u.id,
  ('20000000-0000-0000-0000-' || lpad((((u.ordinal + day_offset) % 16) + 1)::text, 12, '0'))::uuid,
  ((public.eastern_date() - day_offset) + time '08:00' + u.ordinal * interval '50 minutes') at time zone 'America/New_York',
  ((public.eastern_date() - day_offset) + time '08:00' + u.ordinal * interval '50 minutes') at time zone 'America/New_York'
from (values
  (1, '10000000-0000-0000-0000-000000000001'::uuid),
  (2, '10000000-0000-0000-0000-000000000002'::uuid),
  (3, '10000000-0000-0000-0000-000000000003'::uuid),
  (4, '10000000-0000-0000-0000-000000000004'::uuid),
  (5, '10000000-0000-0000-0000-000000000005'::uuid),
  (6, '10000000-0000-0000-0000-000000000006'::uuid),
  (7, '10000000-0000-0000-0000-000000000007'::uuid),
  (8, '10000000-0000-0000-0000-000000000008'::uuid)
) u(ordinal, id)
cross join generate_series(0, 27) as days(day_offset)
where (day_offset % 2 = 0 or day_offset = 1)
  and (day_offset <= 6 or u.ordinal <= 6)
on conflict (id) do nothing;

insert into public.log_upvotes (log_id, user_id, created_at)
select l.id, voter.id, l.logged_at + interval '2 hours'
from public.snack_logs l
cross join (values
  (1, '10000000-0000-0000-0000-000000000001'::uuid),
  (2, '10000000-0000-0000-0000-000000000002'::uuid),
  (3, '10000000-0000-0000-0000-000000000003'::uuid),
  (4, '10000000-0000-0000-0000-000000000004'::uuid),
  (5, '10000000-0000-0000-0000-000000000005'::uuid),
  (6, '10000000-0000-0000-0000-000000000006'::uuid),
  (7, '10000000-0000-0000-0000-000000000007'::uuid),
  (8, '10000000-0000-0000-0000-000000000008'::uuid)
) voter(ordinal, id)
where left(l.user_id::text, 24) = '10000000-0000-0000-0000-'
  and voter.id <> l.user_id
  and (voter.ordinal + extract(day from l.logged_on)::integer) % 3 = 0
on conflict (log_id, user_id) do nothing;

-- Four completed weeks provide reports and award history; the latest week is a
-- fully populated live final so every bracket column has something to inspect.
insert into public.bracket_weeks (
  id, week_start, status, nomination_opens_at, nomination_closes_at, results_publish_at, created_at, updated_at
)
select
  ('40000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid,
  target_monday - (week_offset * 7),
  case when ordinal = 1 then 'final'::public.bracket_week_status else 'results'::public.bracket_week_status end,
  public.eastern_timestamp(target_monday - (week_offset * 7), time '09:00'),
  public.eastern_timestamp(target_monday - (week_offset * 7), time '12:00'),
  public.eastern_timestamp(target_monday - (week_offset * 7) + 4, time '09:00'),
  now() - make_interval(days => week_offset * 7 + 2),
  now() - make_interval(days => greatest(week_offset * 7 - 4, 0))
from (values (1, 0), (2, 1), (3, 2), (4, 3), (5, 4)) as weeks(ordinal, week_offset)
cross join lateral (
  select public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end as target_monday
) calendar
on conflict (week_start) do update set
  status = case when not exists (select 1 from public.bracket_entries e where e.week_id = bracket_weeks.id) then excluded.status else bracket_weeks.status end,
  nomination_opens_at = case when not exists (select 1 from public.bracket_entries e where e.week_id = bracket_weeks.id) then excluded.nomination_opens_at else bracket_weeks.nomination_opens_at end,
  nomination_closes_at = case when not exists (select 1 from public.bracket_entries e where e.week_id = bracket_weeks.id) then excluded.nomination_closes_at else bracket_weeks.nomination_closes_at end,
  results_publish_at = case when not exists (select 1 from public.bracket_entries e where e.week_id = bracket_weeks.id) then excluded.results_publish_at else bracket_weeks.results_publish_at end,
  updated_at = case when not exists (select 1 from public.bracket_entries e where e.week_id = bracket_weeks.id) then excluded.updated_at else bracket_weeks.updated_at end;

insert into public.bracket_entries (id, week_id, snack_id, seed, created_at)
select
  ('50000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid,
  w.id,
  ('20000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid,
  ordinal, now() - interval '5 days'
from generate_series(1, 16) entries(ordinal)
cross join lateral (
  select public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end as target_monday
) calendar
join public.bracket_weeks w on w.week_start = calendar.target_monday
where not exists (select 1 from public.bracket_entries existing where existing.week_id = w.id)
on conflict (id) do nothing;

insert into public.bracket_entry_owners (week_id, entry_id, user_id, nominated_at)
select
  e.week_id,
  e.id,
  ('10000000-0000-0000-0000-' || lpad(user_ordinal::text, 12, '0'))::uuid,
  now() - interval '6 days' + user_ordinal * interval '12 minutes'
from (values (1, 1), (2, 1), (3, 2), (4, 3), (5, 3), (6, 4), (7, 5), (8, 5)) owners(user_ordinal, entry_ordinal)
join public.bracket_entries e on e.id = ('50000000-0000-0000-0000-' || lpad(entry_ordinal::text, 12, '0'))::uuid
on conflict (entry_id, user_id) do nothing;

insert into public.bracket_matchups (
  id, week_id, round_number, position, left_entry_id, right_entry_id,
  winner_entry_id, status, opens_at, closes_at, resolved_at, created_at, updated_at
)
select
  ('60000000-0000-0000-0000-' || lpad(matchup_ordinal::text, 12, '0'))::uuid,
  w.id, round_number, position,
  ('50000000-0000-0000-0000-' || lpad(left_ordinal::text, 12, '0'))::uuid,
  ('50000000-0000-0000-0000-' || lpad(right_ordinal::text, 12, '0'))::uuid,
  case when winner_ordinal is null then null else ('50000000-0000-0000-0000-' || lpad(winner_ordinal::text, 12, '0'))::uuid end,
  case when winner_ordinal is null then 'open'::public.bracket_matchup_status else 'resolved'::public.bracket_matchup_status end,
  case when winner_ordinal is null then now() - interval '1 day' else now() - interval '7 days' end,
  case when winner_ordinal is null then now() + interval '2 days' else now() - interval '6 days' end,
  case when winner_ordinal is null then null else now() - interval '6 days' end,
  now() - interval '7 days', now() - interval '1 hour'
from (values
  (1, 1, 1, 1, 2, 1),   (2, 1, 2, 3, 4, 4),
  (3, 1, 3, 5, 6, 5),   (4, 1, 4, 7, 8, 8),
  (5, 1, 5, 9, 10, 9),  (6, 1, 6, 11, 12, 12),
  (7, 1, 7, 13, 14, 13),(8, 1, 8, 15, 16, 16),
  (9, 2, 1, 1, 4, 1),  (10, 2, 2, 5, 8, 8),
  (11, 2, 3, 9, 12, 12),(12, 2, 4, 13, 16, 16),
  (13, 3, 1, 1, 8, 8), (14, 3, 2, 12, 16, 16),
  (15, 4, 1, 8, 16, null)
) matchups(matchup_ordinal, round_number, position, left_ordinal, right_ordinal, winner_ordinal)
cross join lateral (
  select public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end as target_monday
) calendar
join public.bracket_weeks w on w.week_start = calendar.target_monday
where (select count(*) from public.bracket_entries e where e.week_id = w.id and left(e.id::text, 24) = '50000000-0000-0000-0000-') = 16
on conflict (id) do nothing;

insert into public.bracket_votes (matchup_id, user_id, entry_id, created_at, updated_at)
select
  m.id,
  ('10000000-0000-0000-0000-' || lpad(user_ordinal::text, 12, '0'))::uuid,
  case when (user_ordinal + m.position + m.round_number) % 3 = 0 then m.right_entry_id else m.left_entry_id end,
  least(now() - interval '2 hours', m.closes_at - interval '1 hour'),
  least(now() - interval '2 hours', m.closes_at - interval '1 hour')
from public.bracket_matchups m
cross join generate_series(1, 5) voters(user_ordinal)
where left(m.id::text, 24) = '60000000-0000-0000-0000-'
on conflict (matchup_id, user_id) do nothing;

do $$
declare
  current_week public.bracket_weeks;
begin
  select w.* into current_week
  from public.bracket_weeks w
  where w.week_start = public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end;

  if current_week.id is not null
    and not exists (select 1 from public.bracket_matchups m where m.week_id = current_week.id)
    and not exists (select 1 from public.bracket_entries e where e.week_id = current_week.id and e.seed is not null)
  then
    perform public.seed_bracket(current_week.id, current_week.nomination_closes_at);
  end if;
end
$$;

insert into public.bracket_entries (id, week_id, snack_id, seed, created_at)
select
  ('51000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid,
  w.id,
  ('20000000-0000-0000-0000-' || lpad(ordinal::text, 12, '0'))::uuid,
  ordinal, now() - interval '13 days'
from generate_series(1, 4) entries(ordinal)
cross join lateral (
  select public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end as target_monday
) calendar
join public.bracket_weeks w on w.week_start = calendar.target_monday - 7
where not exists (select 1 from public.bracket_entries existing where existing.week_id = w.id)
on conflict (id) do nothing;

insert into public.bracket_entry_owners (week_id, entry_id, user_id, nominated_at)
select e.week_id, e.id, user_id, now() - interval '13 days'
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid),
  ('10000000-0000-0000-0000-000000000002'::uuid)
) owners(user_id)
join public.bracket_entries e on e.id = '51000000-0000-0000-0000-000000000001'
on conflict (entry_id, user_id) do nothing;

update public.bracket_weeks w
set champion_entry_id = e.id
from public.bracket_entries e
where e.id = '51000000-0000-0000-0000-000000000001'
  and e.week_id = w.id;

insert into public.weekly_reports (id, week_id, report_date, published_at, payload)
select
  ('70000000-0000-0000-0000-' || lpad(week_ordinal::text, 12, '0'))::uuid,
  w.id,
  target_monday - (week_offset * 7) + 4,
  public.eastern_timestamp(target_monday - (week_offset * 7) + 4, time '09:00'),
  jsonb_build_object(
    'weekStart', target_monday - (week_offset * 7),
    'topSnackId', top_snack_id,
    'nutritionSnackId', '20000000-0000-0000-0000-000000000003'::uuid,
    'bracketChampionEntryId', case when week_ordinal = 2 then '51000000-0000-0000-0000-000000000001'::uuid else null end,
    'leaderboard', jsonb_build_array(
      jsonb_build_object('snack_id', top_snack_id, 'snack_name', top_snack_name, 'log_count', 12 - week_offset, 'upvote_count', 18 - week_offset),
      jsonb_build_object('snack_id', '20000000-0000-0000-0000-000000000003'::uuid, 'snack_name', 'Honeycrisp Apple', 'log_count', 9, 'upvote_count', 13)
    )
  )
from (values
  (2, 1, '20000000-0000-0000-0000-000000000001'::uuid, 'Sea Salt Popcorn'),
  (3, 2, '20000000-0000-0000-0000-000000000008'::uuid, 'Sparkling Water'),
  (4, 3, '20000000-0000-0000-0000-000000000006'::uuid, 'Spicy Trail Mix'),
  (5, 4, '20000000-0000-0000-0000-000000000004'::uuid, 'Greek Yogurt')
) reports(week_ordinal, week_offset, top_snack_id, top_snack_name)
cross join lateral (
  select public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end as target_monday
) calendar
join public.bracket_weeks w on w.week_start = calendar.target_monday - (reports.week_offset * 7)
on conflict (week_id) do nothing;

insert into public.badge_tenures (
  id, badge_definition_id, user_id, start_date, end_date, source_week_id, created_at
)
select
  md5(b.key || ':' || user_ordinal::text || ':' || start_days_ago::text)::uuid,
  b.id,
  ('10000000-0000-0000-0000-' || lpad(user_ordinal::text, 12, '0'))::uuid,
  public.eastern_date() - start_days_ago,
  case when end_days_ago is null then null else public.eastern_date() - end_days_ago end,
  w.id,
  now() - make_interval(days => start_days_ago)
from (values
  (1, 'top-snack', 28, 22, 5),
  (1, 'bracket-champion', 7, null, 2),
  (2, 'bracket-champion', 7, null, 2),
  (2, 'nutrition-standout', 14, null, 3),
  (3, 'top-snack', 14, null, 3),
  (4, 'category-chips-savory', 21, null, 4),
  (5, 'category-fruit', 28, 15, 5),
  (6, 'category-protein', 21, null, 4),
  (7, 'category-dairy', 7, null, 2),
  (8, 'category-candy-sweets', 14, null, 3)
) awards(user_ordinal, badge_key, start_days_ago, end_days_ago, source_week_ordinal)
join public.badge_definitions b on b.key = awards.badge_key
cross join lateral (
  select public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end as target_monday
) calendar
join public.bracket_weeks w on w.week_start = calendar.target_monday - ((source_week_ordinal - 1) * 7)
on conflict (badge_definition_id, user_id, start_date) do nothing;

insert into public.snack_corrections (
  id, snack_id, suggested_by, proposed_changes, reason, status, reviewed_by, reviewed_at, created_at
) values
  (
    '80000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '{"brand":"Snyder''s of Hanover"}',
    'The full brand name is printed on the office box.',
    'pending', null, null, now() - interval '6 hours'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000003',
    '{"name":"Strawberry + Apple Fruit Bar"}',
    'Updated to match the wrapper.',
    'approved', '10000000-0000-0000-0000-000000000001', now() - interval '2 days', now() - interval '3 days'
  )
on conflict (id) do nothing;

do $$
declare
  profile_count integer;
  snack_count integer;
  log_count integer;
  bracket_entry_count integer;
  badge_count integer;
begin
  select count(*) into profile_count from public.profiles where left(user_id::text, 24) = '10000000-0000-0000-0000-';
  select count(*) into snack_count from public.snacks where left(id::text, 24) = '20000000-0000-0000-0000-';
  select count(*) into log_count from public.snack_logs where left(user_id::text, 24) = '10000000-0000-0000-0000-';
  select count(*) into bracket_entry_count
  from public.bracket_entries e
  join public.bracket_weeks w on w.id = e.week_id
  where w.week_start = public.eastern_date() + case
    when extract(isodow from public.eastern_date()) <= 4 then 1 - extract(isodow from public.eastern_date())::integer
    else 8 - extract(isodow from public.eastern_date())::integer
  end;
  select count(*) into badge_count from public.badge_tenures where left(user_id::text, 24) = '10000000-0000-0000-0000-';

  if profile_count <> 8 or snack_count <> 16 or log_count < 90 or bracket_entry_count < 1 or badge_count < 10 then
    raise exception 'Snack Squad demo seed is incomplete: profiles %, snacks %, bracket entries %, logs %, badges %.',
      profile_count, snack_count, bracket_entry_count, log_count, badge_count;
  end if;
end
$$;
