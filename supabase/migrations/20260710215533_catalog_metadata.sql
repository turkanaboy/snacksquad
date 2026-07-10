alter table public.snacks
  add column nutrition_complete boolean not null default false,
  add column metadata_verified_at timestamptz;

create type public.correction_status as enum ('pending', 'approved', 'rejected');

create table public.snack_corrections (
  id uuid primary key default gen_random_uuid(),
  snack_id uuid not null references public.snacks(id),
  suggested_by uuid not null references auth.users(id) on delete cascade,
  proposed_changes jsonb not null check (jsonb_typeof(proposed_changes) = 'object' and proposed_changes <> '{}'::jsonb),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  status public.correction_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null)),
  check ((status = 'pending') = (reviewed_by is null)),
  check (octet_length(proposed_changes::text) <= 5000),
  check (
    proposed_changes - array[
      'name', 'brand', 'barcode', 'category', 'image_url', 'source_url',
      'nutri_score', 'nutrition_complete', 'nutrition_verified'
    ] = '{}'::jsonb
  )
);

create index snack_corrections_snack_id_idx on public.snack_corrections(snack_id);
create index snack_corrections_suggested_by_idx on public.snack_corrections(suggested_by);
create index snack_corrections_pending_idx on public.snack_corrections(created_at) where status = 'pending';
create index snack_corrections_reviewed_by_idx on public.snack_corrections(reviewed_by) where reviewed_by is not null;

create function public.upsert_catalog_snack(
  p_name text,
  p_brand text,
  p_barcode text,
  p_category public.snack_category,
  p_source_categories text[],
  p_image_url text,
  p_source_url text,
  p_nutri_score text,
  p_nutrition_complete boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snack_id uuid;
  clean_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  clean_barcode text := nullif(trim(p_barcode), '');
  clean_source_categories text[];
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if char_length(clean_name) not between 1 and 160 then raise exception 'Snack name must be between 1 and 160 characters.'; end if;
  if clean_barcode is not null and clean_barcode !~ '^[0-9]{8,14}$' then raise exception 'Invalid barcode.'; end if;
  if p_image_url is not null and p_image_url !~ '^https://' then raise exception 'Image URL must use HTTPS.'; end if;
  if p_source_url is not null and p_source_url !~ '^https://' then raise exception 'Source URL must use HTTPS.'; end if;
  if p_nutri_score is not null and lower(p_nutri_score) !~ '^[a-e]$' then raise exception 'Invalid Nutri-Score.'; end if;

  select coalesce(array_agg(left(trim(source_category), 120) order by position), '{}')
  into clean_source_categories
  from unnest(coalesce(p_source_categories, '{}')) with ordinality as categories(source_category, position)
  where position <= 30 and trim(source_category) <> '';

  insert into public.snacks (
    name, normalized_name, brand, barcode, category, source_type, source_categories,
    image_url, source_url, nutri_score, nutrition_complete, created_by
  ) values (
    clean_name,
    lower(clean_name),
    nullif(left(trim(p_brand), 160), ''),
    clean_barcode,
    coalesce(p_category, 'Other'),
    'open_food_facts',
    clean_source_categories,
    nullif(left(trim(p_image_url), 500), ''),
    nullif(left(trim(p_source_url), 500), ''),
    lower(nullif(trim(p_nutri_score), '')),
    coalesce(p_nutrition_complete, false),
    auth.uid()
  )
  on conflict (barcode) do update set barcode = excluded.barcode
  returning id into snack_id;

  return snack_id;
end
$$;

create function public.review_snack_correction(p_correction_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  correction public.snack_corrections;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;

  select * into correction
  from public.snack_corrections
  where id = p_correction_id
  for update;

  if correction.id is null then raise exception 'Correction not found.'; end if;
  if correction.status <> 'pending' then raise exception 'Correction has already been reviewed.'; end if;

  if p_approve then
    update public.snacks
    set
      name = case when correction.proposed_changes ? 'name' then left(trim(correction.proposed_changes->>'name'), 160) else name end,
      normalized_name = case when correction.proposed_changes ? 'name' then lower(left(trim(correction.proposed_changes->>'name'), 160)) else normalized_name end,
      brand = case when correction.proposed_changes ? 'brand' then nullif(left(trim(correction.proposed_changes->>'brand'), 160), '') else brand end,
      barcode = case when correction.proposed_changes ? 'barcode' then nullif(trim(correction.proposed_changes->>'barcode'), '') else barcode end,
      category = case when correction.proposed_changes ? 'category' then (correction.proposed_changes->>'category')::public.snack_category else category end,
      image_url = case when correction.proposed_changes ? 'image_url' then nullif(left(trim(correction.proposed_changes->>'image_url'), 500), '') else image_url end,
      source_url = case when correction.proposed_changes ? 'source_url' then nullif(left(trim(correction.proposed_changes->>'source_url'), 500), '') else source_url end,
      nutri_score = case when correction.proposed_changes ? 'nutri_score' then lower(nullif(trim(correction.proposed_changes->>'nutri_score'), '')) else nutri_score end,
      nutrition_complete = case when correction.proposed_changes ? 'nutrition_complete' then (correction.proposed_changes->>'nutrition_complete')::boolean else nutrition_complete end
    where id = correction.snack_id;

    if correction.proposed_changes ? 'nutrition_verified' then
      update public.snacks
      set
        nutrition_verified = (correction.proposed_changes->>'nutrition_verified')::boolean and nutrition_complete and nutri_score is not null,
        metadata_verified_at = case
          when (correction.proposed_changes->>'nutrition_verified')::boolean and nutrition_complete and nutri_score is not null then now()
          else null
        end
      where id = correction.snack_id;
    end if;
  end if;

  update public.snack_corrections
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.correction_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = correction.id;
end
$$;

create or replace function public.enforce_open_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('snack_squad.merge_mode', true) = 'on' and public.is_moderator() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

create function public.merge_snacks(p_survivor_id uuid, p_duplicate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  duplicate_log record;
  survivor_log_id uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_survivor_id = p_duplicate_id then raise exception 'A snack cannot be merged into itself.'; end if;
  if not exists (select 1 from public.snacks where id = p_survivor_id and merged_into_id is null for update) then
    raise exception 'Surviving snack not found.';
  end if;
  if not exists (select 1 from public.snacks where id = p_duplicate_id and merged_into_id is null for update) then
    raise exception 'Duplicate snack not found.';
  end if;

  perform set_config('snack_squad.merge_mode', 'on', true);

  for duplicate_log in
    select id, user_id, logged_on
    from public.snack_logs
    where snack_id = p_duplicate_id
    order by created_at, id
  loop
    select id into survivor_log_id
    from public.snack_logs
    where snack_id = p_survivor_id
      and user_id = duplicate_log.user_id
      and logged_on = duplicate_log.logged_on;

    if survivor_log_id is not null then
      insert into public.log_upvotes (log_id, user_id, created_at)
      select survivor_log_id, user_id, created_at
      from public.log_upvotes
      where log_id = duplicate_log.id
      on conflict (log_id, user_id) do nothing;

      delete from public.snack_logs where id = duplicate_log.id;
    end if;
    survivor_log_id := null;
  end loop;

  update public.snack_logs set snack_id = p_survivor_id where snack_id = p_duplicate_id;
  update public.profiles set favorite_snack_id = p_survivor_id where favorite_snack_id = p_duplicate_id;
  update public.snack_corrections set snack_id = p_survivor_id where snack_id = p_duplicate_id;
  update public.snacks set merged_into_id = p_survivor_id where id = p_duplicate_id;
  perform set_config('snack_squad.merge_mode', 'off', true);
end
$$;

alter table public.snack_corrections enable row level security;

revoke all on public.snack_corrections from anon, authenticated;
grant select, insert on public.snack_corrections to authenticated;

create policy snack_corrections_read_own_or_moderator on public.snack_corrections
for select to authenticated using (suggested_by = (select auth.uid()) or (select public.is_moderator()));
create policy snack_corrections_create_own on public.snack_corrections
for insert to authenticated with check (
  suggested_by = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

revoke execute on function public.upsert_catalog_snack(text, text, text, public.snack_category, text[], text, text, text, boolean) from public, anon;
revoke execute on function public.review_snack_correction(uuid, boolean) from public, anon;
revoke execute on function public.merge_snacks(uuid, uuid) from public, anon;
grant execute on function public.upsert_catalog_snack(text, text, text, public.snack_category, text[], text, text, text, boolean) to authenticated;
grant execute on function public.review_snack_correction(uuid, boolean) to authenticated;
grant execute on function public.merge_snacks(uuid, uuid) to authenticated;
