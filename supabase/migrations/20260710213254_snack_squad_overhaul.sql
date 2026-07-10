do $$
declare
  legacy_rows bigint;
begin
  select
    (select count(*) from public.profiles) +
    (select count(*) from public.snacks) +
    (select count(*) from public.snack_votes) +
    (select count(*) from public.snack_comments) +
    (select count(*) from public.snack_ratings) +
    (select count(*) from public.bracket_votes)
  into legacy_rows;

  if legacy_rows > 0 then
    raise exception 'Snack Squad overhaul stopped: legacy application tables contain % rows.', legacy_rows;
  end if;
end
$$;

drop table public.bracket_votes;
drop table public.snack_ratings;
drop table public.snack_comments;
drop table public.snack_votes;
drop table public.snacks;
drop table public.profiles;

create type public.snack_category as enum (
  'Grains/Bakery',
  'Protein',
  'Dairy',
  'Fruit',
  'Vegetables',
  'Candy/Sweets',
  'Chips/Savory Snacks',
  'Beverages',
  'Other'
);

create type public.snack_source_type as enum ('open_food_facts', 'manual');

create table public.snacks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  normalized_name text not null check (char_length(trim(normalized_name)) between 1 and 160),
  brand text check (brand is null or char_length(brand) <= 160),
  barcode text unique check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  category public.snack_category not null,
  source_type public.snack_source_type not null,
  source_url text check (source_url is null or source_url ~ '^https://'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  source_categories text[] not null default '{}',
  nutri_score text check (nutri_score is null or nutri_score in ('a', 'b', 'c', 'd', 'e')),
  nutrition_verified boolean not null default false,
  merged_into_id uuid references public.snacks(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merged_into_id is null or merged_into_id <> id),
  check (source_type <> 'manual' or nutrition_verified = false)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  favorite_snack_id uuid references public.snacks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key check (char_length(trim(key)) between 1 and 80),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.feature_flags (key, enabled) values ('fantasy_enabled', false);

create function public.eastern_date(value timestamptz default now())
returns date
language sql
immutable
set search_path = ''
as $$
  select (value at time zone 'America/New_York')::date
$$;

create table public.snack_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snack_id uuid not null references public.snacks(id),
  logged_at timestamptz not null default now(),
  logged_on date generated always as (public.eastern_date(logged_at)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, snack_id, logged_on)
);

create table public.log_upvotes (
  log_id uuid not null references public.snack_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (log_id, user_id)
);

create index snacks_created_by_idx on public.snacks(created_by);
create index snacks_category_idx on public.snacks(category) where merged_into_id is null;
create index snacks_normalized_name_idx on public.snacks(normalized_name) where merged_into_id is null;
create index snacks_merged_into_id_idx on public.snacks(merged_into_id) where merged_into_id is not null;
create index profiles_favorite_snack_id_idx on public.profiles(favorite_snack_id) where favorite_snack_id is not null;
create index feature_flags_updated_by_idx on public.feature_flags(updated_by) where updated_by is not null;
create index snack_logs_user_logged_at_idx on public.snack_logs(user_id, logged_at desc);
create index snack_logs_snack_logged_at_idx on public.snack_logs(snack_id, logged_at desc);
create index log_upvotes_user_id_idx on public.log_upvotes(user_id);

create function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := lower(trim(event->'user'->>'email'));
begin
  if user_email is null or user_email !~ '^[^@]+@carnegiehighered[.]com$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Only @carnegiehighered.com email addresses can join Snack Squad.'
      )
    );
  end if;

  return '{}'::jsonb;
end
$$;

create function public.display_name_from_email(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(initcap(regexp_replace(split_part(lower(trim(email)), '@', 1), '[._-]+', ' ', 'g')), ''),
    'Snack Fan'
  )
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, public.display_name_from_email(new.email));
  return new;
end
$$;

create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.moderators where moderators.user_id = auth.uid())
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger touch_snacks_updated_at before update on public.snacks
for each row execute function public.touch_updated_at();
create trigger touch_profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger touch_feature_flags_updated_at before update on public.feature_flags
for each row execute function public.touch_updated_at();
create trigger touch_snack_logs_updated_at before update on public.snack_logs
for each row execute function public.touch_updated_at();

create function public.enforce_open_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.logged_on <> public.eastern_date() then
    raise exception 'Snack logs can only be changed on the day they were logged.';
  end if;

  if tg_op = 'UPDATE' and public.eastern_date(new.logged_at) <> old.logged_on then
    raise exception 'A snack log cannot be moved to a different day.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create trigger enforce_open_log_mutation
before update or delete on public.snack_logs
for each row execute function public.enforce_open_log_mutation();

create function public.prevent_self_upvote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.snack_logs
    where snack_logs.id = new.log_id and snack_logs.user_id = new.user_id
  ) then
    raise check_violation using message = 'Users cannot upvote their own snack log.';
  end if;
  return new;
end
$$;

create trigger prevent_self_upvote
before insert or update on public.log_upvotes
for each row execute function public.prevent_self_upvote();

create function public.board_feed(p_limit integer default 30, p_before timestamptz default null)
returns table (
  log_id uuid,
  snack_id uuid,
  snack_name text,
  category public.snack_category,
  image_url text,
  logger_id uuid,
  logger_name text,
  logged_at timestamptz,
  upvote_count bigint,
  viewer_upvoted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  return query
  select l.id, s.id, s.name, s.category, s.image_url, l.user_id, p.display_name, l.logged_at,
    count(u.user_id), bool_or(u.user_id = auth.uid())
  from public.snack_logs l
  join public.snacks s on s.id = l.snack_id and s.merged_into_id is null
  join public.profiles p on p.user_id = l.user_id
  left join public.log_upvotes u on u.log_id = l.id
  where p_before is null or l.logged_at < p_before
  group by l.id, s.id, p.display_name
  order by l.logged_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end
$$;

create function public.snack_leaderboard(p_days integer default 30, p_limit integer default 10)
returns table (snack_id uuid, snack_name text, category public.snack_category, log_count bigint, upvote_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  return query
  select s.id, s.name, s.category, count(distinct l.id), count(u.user_id)
  from public.snacks s
  join public.snack_logs l on l.snack_id = s.id
  left join public.log_upvotes u on u.log_id = l.id
  where s.merged_into_id is null
    and (p_days is null or l.logged_at >= now() - make_interval(days => greatest(p_days, 1)))
  group by s.id
  order by count(u.user_id) desc, count(distinct l.id) desc, s.normalized_name
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end
$$;

create function public.profile_summary(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  favorite_snack_id uuid,
  favorite_snack_name text,
  total_logs bigint,
  distinct_snacks bigint,
  category_mix jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  return query
  select p.user_id, p.display_name, p.favorite_snack_id, favorite.name,
    count(l.id), count(distinct l.snack_id),
    coalesce((
      select jsonb_object_agg(category_rows.category, category_rows.log_count)
      from (
        select s.category::text as category, count(*) as log_count
        from public.snack_logs category_logs
        join public.snacks s on s.id = category_logs.snack_id
        where category_logs.user_id = p.user_id
        group by s.category
      ) category_rows
    ), '{}'::jsonb)
  from public.profiles p
  left join public.snacks favorite on favorite.id = p.favorite_snack_id
  left join public.snack_logs l on l.user_id = p.user_id
  where p.user_id = p_user_id
  group by p.user_id, favorite.name;
end
$$;

alter table public.snacks enable row level security;
alter table public.profiles enable row level security;
alter table public.moderators enable row level security;
alter table public.feature_flags enable row level security;
alter table public.snack_logs enable row level security;
alter table public.log_upvotes enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
revoke all on public.snacks, public.profiles, public.moderators, public.feature_flags, public.snack_logs, public.log_upvotes from authenticated;

grant select, insert on public.snacks to authenticated;
grant update on public.snacks to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.feature_flags to authenticated;
grant select, insert, update, delete on public.snack_logs to authenticated;
grant select, insert, delete on public.log_upvotes to authenticated;

create policy snacks_read_authenticated on public.snacks
for select to authenticated using (merged_into_id is null);
create policy snacks_create_manual on public.snacks
for insert to authenticated with check (created_by = (select auth.uid()) and source_type = 'manual');
create policy snacks_update_moderator on public.snacks
for update to authenticated using ((select public.is_moderator())) with check ((select public.is_moderator()));

create policy profiles_read_own on public.profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy feature_flags_read_authenticated on public.feature_flags
for select to authenticated using (true);
create policy feature_flags_update_moderator on public.feature_flags
for update to authenticated using ((select public.is_moderator())) with check ((select public.is_moderator()));

create policy snack_logs_read_own on public.snack_logs
for select to authenticated using (user_id = (select auth.uid()));
create policy snack_logs_create_own on public.snack_logs
for insert to authenticated with check (user_id = (select auth.uid()));
create policy snack_logs_update_own on public.snack_logs
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy snack_logs_delete_own on public.snack_logs
for delete to authenticated using (user_id = (select auth.uid()));

create policy log_upvotes_read_own on public.log_upvotes
for select to authenticated using (user_id = (select auth.uid()));
create policy log_upvotes_create_own on public.log_upvotes
for insert to authenticated with check (user_id = (select auth.uid()));
create policy log_upvotes_delete_own on public.log_upvotes
for delete to authenticated using (user_id = (select auth.uid()));

grant execute on function public.board_feed(integer, timestamptz) to authenticated;
grant execute on function public.snack_leaderboard(integer, integer) to authenticated;
grant execute on function public.profile_summary(uuid) to authenticated;
grant execute on function public.eastern_date(timestamptz) to authenticated;
grant execute on function public.is_moderator() to authenticated;

revoke execute on function public.before_user_created_hook(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_open_log_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_self_upvote() from public, anon, authenticated;
