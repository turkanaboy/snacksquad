update public.snacks
set barcode = null
where merged_into_id is not null
  and barcode is not null;

do $migration$
begin
  if exists (
    select lpad(barcode, 14, '0')
    from public.snacks
    where barcode ~ '^[0-9]{8,14}$'
    group by lpad(barcode, 14, '0')
    having count(*) > 1
  ) then
    raise exception 'Equivalent barcode records must be merged before USDA migration.';
  end if;
end
$migration$;

update public.snacks
set barcode = lpad(barcode, 14, '0')
where barcode ~ '^[0-9]{8,14}$'
  and char_length(barcode) < 14;

create or replace function public.normalize_snack_barcode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.barcode is not null and trim(new.barcode) ~ '^[0-9]{8,14}$' then
    new.barcode := lpad(trim(new.barcode), 14, '0');
  end if;
  return new;
end
$$;

drop trigger if exists normalize_snack_barcode on public.snacks;
create trigger normalize_snack_barcode
before insert or update of barcode on public.snacks
for each row execute function public.normalize_snack_barcode();

create or replace function public.upsert_catalog_snack(
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
  if clean_barcode is not null then clean_barcode := lpad(clean_barcode, 14, '0'); end if;
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
    'usda',
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
