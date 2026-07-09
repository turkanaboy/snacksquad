create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.snacks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null,
  category text,
  note text,
  source_note text,
  image_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.snack_votes (
  snack_id uuid not null references public.snacks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value integer not null default 1 check (value in (1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snack_id, user_id)
);

create table public.snack_comments (
  id uuid primary key default gen_random_uuid(),
  snack_id uuid not null references public.snacks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  body text not null check (length(trim(body)) > 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.snack_ratings (
  snack_id uuid not null references public.snacks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snack_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.snacks enable row level security;
alter table public.snack_votes enable row level security;
alter table public.snack_comments enable row level security;
alter table public.snack_ratings enable row level security;

grant select on public.profiles, public.snacks, public.snack_votes, public.snack_comments to anon, authenticated;
grant select on public.snack_ratings to authenticated;
grant insert, update on public.profiles, public.snacks, public.snack_votes, public.snack_comments, public.snack_ratings to authenticated;

create policy "profiles readable" on public.profiles
  for select to anon, authenticated using (true);

create policy "profiles insert own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "profiles update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "snacks readable" on public.snacks
  for select to anon, authenticated using (true);

create policy "snacks insert own" on public.snacks
  for insert to authenticated with check ((select auth.uid()) = created_by);

create policy "snacks update own" on public.snacks
  for update to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

create policy "votes readable" on public.snack_votes
  for select to anon, authenticated using (true);

create policy "votes upsert own" on public.snack_votes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "votes update own" on public.snack_votes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "comments readable" on public.snack_comments
  for select to anon, authenticated using (deleted = false);

create policy "comments insert own" on public.snack_comments
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "comments update own" on public.snack_comments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "ratings read own" on public.snack_ratings
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "ratings upsert own" on public.snack_ratings
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "ratings update own" on public.snack_ratings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
