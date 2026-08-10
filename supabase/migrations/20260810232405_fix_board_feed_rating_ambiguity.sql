create or replace function public.board_feed(p_limit integer default 30, p_before timestamptz default null)
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
    join (
      select distinct feed_logs.snack_id
      from page_logs feed_logs
    ) page_snacks on page_snacks.snack_id = own_logs.snack_id
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
  left join viewer_ratings on viewer_ratings.snack_id = page_logs.snack_id
  left join upvote_totals on upvote_totals.log_id = page_logs.id
  order by page_logs.logged_at desc, page_logs.id desc;
end
$$;

revoke all on function public.board_feed(integer, timestamptz) from public, anon;
grant execute on function public.board_feed(integer, timestamptz) to authenticated;
