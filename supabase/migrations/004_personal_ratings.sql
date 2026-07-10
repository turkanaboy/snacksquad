create table if not exists public.snack_ratings (
  snack_id uuid not null references public.snacks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snack_id, user_id)
);

alter table public.snack_ratings enable row level security;

grant select on public.snack_ratings to authenticated;
grant insert, update on public.snack_ratings to authenticated;

drop policy if exists "ratings read own" on public.snack_ratings;
drop policy if exists "ratings upsert own" on public.snack_ratings;
drop policy if exists "ratings update own" on public.snack_ratings;

create policy "ratings read own" on public.snack_ratings
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "ratings upsert own" on public.snack_ratings
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "ratings update own" on public.snack_ratings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
