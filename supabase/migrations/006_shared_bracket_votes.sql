create table if not exists public.bracket_votes (
  week_key text not null,
  match_key text not null,
  snack_id uuid not null references public.snacks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_key, match_key, user_id)
);

alter table public.bracket_votes enable row level security;

grant select on public.bracket_votes to anon, authenticated;
grant insert, update on public.bracket_votes to authenticated;

create policy "bracket votes readable" on public.bracket_votes
  for select to anon, authenticated using (true);

create policy "bracket votes upsert own" on public.bracket_votes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "bracket votes update own" on public.bracket_votes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
