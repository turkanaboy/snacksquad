alter table public.snack_logs add column rating integer;

alter table public.snack_logs disable trigger enforce_open_log_mutation;
alter table public.snack_logs disable trigger touch_snack_logs_updated_at;

with ranked_logs as (
  select id, 1 + mod(row_number() over (order by logged_at, id) - 1, 5)::integer as seeded_rating
  from public.snack_logs
)
update public.snack_logs logs
set rating = ranked_logs.seeded_rating
from ranked_logs
where logs.id = ranked_logs.id;

alter table public.snack_logs enable trigger touch_snack_logs_updated_at;
alter table public.snack_logs enable trigger enforce_open_log_mutation;

alter table public.snack_logs
  alter column rating set default 3,
  alter column rating set not null,
  add constraint snack_logs_rating_check check (rating between 1 and 5);

create index snack_logs_user_snack_rating_idx
  on public.snack_logs(user_id, snack_id, logged_at desc)
  include (rating);

drop function public.board_feed(integer, timestamptz);

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
  poster_rating integer,
  viewer_rating integer,
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
  with page_logs as materialized (
    select
      logs.id,
      logs.snack_id,
      snacks.name as snack_name,
      snacks.category,
      snacks.image_url,
      logs.user_id,
      profiles.display_name,
      logs.logged_at,
      logs.rating
    from public.snack_logs logs
    join public.snacks snacks on snacks.id = logs.snack_id and snacks.merged_into_id is null
    join public.profiles profiles on profiles.user_id = logs.user_id
    where not public.is_fantasy_test_actor(logs.user_id)
      and (p_before is null or logs.logged_at < p_before)
    order by logs.logged_at desc, logs.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ),
  viewer_ratings as (
    select distinct on (own_logs.snack_id) own_logs.snack_id, own_logs.rating
    from public.snack_logs own_logs
    join (select distinct snack_id from page_logs) page_snacks using (snack_id)
    where own_logs.user_id = auth.uid()
    order by own_logs.snack_id, own_logs.logged_at desc
  ),
  upvote_totals as (
    select
      upvotes.log_id,
      count(upvotes.user_id) as upvote_count,
      bool_or(upvotes.user_id = auth.uid()) as viewer_upvoted
    from public.log_upvotes upvotes
    join page_logs on page_logs.id = upvotes.log_id
    where not public.is_fantasy_test_actor(upvotes.user_id)
    group by upvotes.log_id
  )
  select
    page_logs.id,
    page_logs.snack_id,
    page_logs.snack_name,
    page_logs.category,
    page_logs.image_url,
    page_logs.user_id,
    page_logs.display_name,
    page_logs.logged_at,
    page_logs.rating,
    viewer_ratings.rating,
    coalesce(upvote_totals.upvote_count, 0::bigint),
    coalesce(upvote_totals.viewer_upvoted, false)
  from page_logs
  left join viewer_ratings using (snack_id)
  left join upvote_totals on upvote_totals.log_id = page_logs.id
  order by page_logs.logged_at desc, page_logs.id desc;
end
$$;

revoke all on function public.board_feed(integer, timestamptz) from public, anon;
grant execute on function public.board_feed(integer, timestamptz) to authenticated;
