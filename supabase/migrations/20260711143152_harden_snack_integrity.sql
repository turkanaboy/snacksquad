revoke execute on function public.upsert_catalog_snack(
  text, text, text, public.snack_category, text[], text, text, text, boolean
) from authenticated;

create function public.import_catalog_snack(
  p_name text,
  p_brand text,
  p_barcode text,
  p_category public.snack_category,
  p_source_categories text[],
  p_image_url text,
  p_source_url text,
  p_nutrition_complete boolean,
  p_created_by uuid
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
  if char_length(clean_name) not between 1 and 160 then raise exception 'Snack name must be between 1 and 160 characters.'; end if;
  if clean_barcode is not null and clean_barcode !~ '^[0-9]{8,14}$' then raise exception 'Invalid barcode.'; end if;
  if clean_barcode is not null then clean_barcode := lpad(clean_barcode, 14, '0'); end if;
  if p_image_url is not null and p_image_url !~ '^https://' then raise exception 'Image URL must use HTTPS.'; end if;
  if p_source_url is null or p_source_url !~ '^https://fdc\.nal\.usda\.gov/' then raise exception 'Invalid USDA source URL.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_source_url, 0));
  select id into snack_id
  from public.snacks
  where source_type = 'usda' and source_url = p_source_url and merged_into_id is null
  limit 1;
  if snack_id is not null then return snack_id; end if;

  select coalesce(array_agg(left(trim(source_category), 120) order by position), '{}')
  into clean_source_categories
  from unnest(coalesce(p_source_categories, '{}')) with ordinality as categories(source_category, position)
  where position <= 30 and trim(source_category) <> '';

  insert into public.snacks (
    name, normalized_name, brand, barcode, category, source_type, source_categories,
    image_url, source_url, nutrition_complete, created_by
  ) values (
    clean_name,
    lower(clean_name),
    nullif(left(trim(p_brand), 160), ''),
    clean_barcode,
    coalesce(p_category, 'Other'),
    'usda',
    clean_source_categories,
    nullif(left(trim(p_image_url), 500), ''),
    nullif(left(trim(p_source_url), 500), ''),
    coalesce(p_nutrition_complete, false),
    p_created_by
  )
  on conflict (barcode) do update set barcode = excluded.barcode
  returning id into snack_id;

  return snack_id;
end
$$;

revoke execute on function public.import_catalog_snack(
  text, text, text, public.snack_category, text[], text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.import_catalog_snack(
  text, text, text, public.snack_category, text[], text, text, boolean, uuid
) to service_role;

create or replace function public.merge_snacks(p_survivor_id uuid, p_duplicate_id uuid)
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

  -- ponytail: competition history stays immutable; add a dedicated historical merge only if moderators need it.
  if exists (select 1 from public.bracket_entries where snack_id in (p_survivor_id, p_duplicate_id))
    or exists (select 1 from public.fantasy_preferences where snack_id in (p_survivor_id, p_duplicate_id))
    or exists (select 1 from public.fantasy_picks where snack_id in (p_survivor_id, p_duplicate_id))
    or exists (select 1 from public.fantasy_roster_slots where snack_id in (p_survivor_id, p_duplicate_id))
    or exists (select 1 from public.fantasy_waivers where outgoing_snack_id in (p_survivor_id, p_duplicate_id) or incoming_snack_id in (p_survivor_id, p_duplicate_id)) then
    raise exception 'Snack is used by competition history and cannot be merged.';
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

revoke execute on function public.merge_snacks(uuid, uuid) from public, anon;
grant execute on function public.merge_snacks(uuid, uuid) to authenticated;
