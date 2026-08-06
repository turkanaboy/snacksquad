create table public.snack_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  snack_id uuid not null references public.snacks(id) on delete cascade,
  sentiment smallint not null check (sentiment in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, snack_id)
);

create table public.snack_releases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  brand text check (brand is null or char_length(trim(brand)) between 1 and 120),
  summary text check (summary is null or char_length(trim(summary)) between 1 and 500),
  article_url text check (article_url is null or article_url ~ '^https://'),
  published_at date not null,
  created_at timestamptz not null default now()
);

create index snack_preferences_updated_at_idx on public.snack_preferences(user_id, updated_at desc);
create index snack_releases_published_at_idx on public.snack_releases(published_at desc, id desc);

create trigger touch_snack_preferences_updated_at before update on public.snack_preferences
for each row execute function public.touch_updated_at();

alter table public.snack_preferences enable row level security;
alter table public.snack_releases enable row level security;

revoke all on public.snack_preferences, public.snack_releases from anon, authenticated;
grant select, insert, update, delete on public.snack_preferences to authenticated;
grant select on public.snack_releases to authenticated;
grant all on public.snack_releases to service_role;

create policy snack_preferences_read_own on public.snack_preferences
for select to authenticated using (user_id = (select auth.uid()));
create policy snack_preferences_create_own on public.snack_preferences
for insert to authenticated with check (user_id = (select auth.uid()));
create policy snack_preferences_update_own on public.snack_preferences
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy snack_preferences_delete_own on public.snack_preferences
for delete to authenticated using (user_id = (select auth.uid()));

create policy snack_releases_read_authenticated on public.snack_releases
for select to authenticated using (true);
