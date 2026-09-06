-- Keep historical scores without claiming they were explicitly supplied by members.
alter table public.snack_logs add column rating_source text not null default 'legacy_unknown'
  check (rating_source in ('user', 'legacy_unknown'));

-- Table privileges must be revoked before column privileges take effect.
revoke insert, update on public.snack_logs from authenticated;
grant insert (user_id, snack_id, rating, rating_source) on public.snack_logs to authenticated;
grant update (snack_id, rating, rating_source) on public.snack_logs to authenticated;
revoke insert on public.log_upvotes from authenticated;
grant insert (log_id, user_id) on public.log_upvotes to authenticated;
grant select, insert, update, delete on public.snack_logs, public.log_upvotes to service_role;

create or replace function public.board_feed_page(p_limit integer default 30, p_before timestamptz default null, p_before_id uuid default null)
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
  poster_rating_source text,
  viewer_rating integer,
  viewer_rating_source text,
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
      logs.rating,
      logs.rating_source
    from public.snack_logs logs
    join public.snacks snacks on snacks.id = logs.snack_id and snacks.merged_into_id is null
    join public.profiles profiles on profiles.user_id = logs.user_id
    where not public.is_fantasy_test_actor(logs.user_id)
      and (p_before is null or logs.logged_at < p_before or (logs.logged_at = p_before and logs.id < p_before_id))
    order by logs.logged_at desc, logs.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ),
  viewer_ratings as (
    select distinct on (own_logs.snack_id) own_logs.snack_id, own_logs.rating, own_logs.rating_source
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
    page_logs.rating_source,
    viewer_ratings.rating,
    viewer_ratings.rating_source,
    coalesce(upvote_totals.upvote_count, 0::bigint),
    coalesce(upvote_totals.viewer_upvoted, false)
  from page_logs
  left join viewer_ratings on viewer_ratings.snack_id = page_logs.snack_id
  left join upvote_totals on upvote_totals.log_id = page_logs.id
  order by page_logs.logged_at desc, page_logs.id desc;
end
$$;

revoke all on function public.board_feed_page(integer, timestamptz, uuid) from public, anon;
grant execute on function public.board_feed_page(integer, timestamptz, uuid) to authenticated;


create or replace function public.merge_snacks(p_survivor_id uuid,p_duplicate_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare duplicate_log record; survivor_log_id uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_survivor_id=p_duplicate_id then raise exception 'A snack cannot be merged into itself.'; end if;
  if not exists(select 1 from public.snacks where id=p_survivor_id and merged_into_id is null for update) then raise exception 'Surviving snack not found.'; end if;
  if not exists(select 1 from public.snacks where id=p_duplicate_id and merged_into_id is null for update) then raise exception 'Duplicate snack not found.'; end if;
  -- ponytail: competition history stays immutable; add a historical merge only if moderators need it.
  if exists(select 1 from public.bracket_entries where snack_id in (p_survivor_id,p_duplicate_id))
    or exists(select 1 from public.fantasy_preferences where snack_id in (p_survivor_id,p_duplicate_id))
    or exists(select 1 from public.fantasy_picks where snack_id in (p_survivor_id,p_duplicate_id))
    or exists(select 1 from public.fantasy_roster_slots where snack_id in (p_survivor_id,p_duplicate_id)) then
    raise exception 'Snack is used by competition history and cannot be merged.';
  end if;
  perform set_config('snack_squad.merge_mode','on',true);
  for duplicate_log in select id,user_id,logged_on from public.snack_logs where snack_id=p_duplicate_id order by created_at,id loop
    select id into survivor_log_id from public.snack_logs where snack_id=p_survivor_id and user_id=duplicate_log.user_id and logged_on=duplicate_log.logged_on;
    if survivor_log_id is not null then
      insert into public.log_upvotes(log_id,user_id,created_at)
      select survivor_log_id,user_id,created_at from public.log_upvotes where log_id=duplicate_log.id
      on conflict(log_id,user_id) do nothing;
      delete from public.snack_logs where id=duplicate_log.id;
    end if;
    survivor_log_id:=null;
  end loop;
  -- Most recently edited preference wins when the same member liked both snacks.
  insert into public.snack_preferences(user_id, snack_id, sentiment, created_at, updated_at)
  select user_id,p_survivor_id,sentiment,created_at,updated_at
  from public.snack_preferences where snack_id=p_duplicate_id
  on conflict(user_id,snack_id) do update
    set sentiment=excluded.sentiment, updated_at=excluded.updated_at
    where excluded.updated_at > public.snack_preferences.updated_at;
  delete from public.snack_preferences where snack_id=p_duplicate_id;
  update public.snack_logs set snack_id=p_survivor_id where snack_id=p_duplicate_id;
  update public.profiles set favorite_snack_id=p_survivor_id where favorite_snack_id=p_duplicate_id;
  update public.snack_corrections set snack_id=p_survivor_id where snack_id=p_duplicate_id;
  update public.snacks set merged_into_id=p_survivor_id where id=p_duplicate_id;
  perform set_config('snack_squad.merge_mode','off',true);
end
$$;

create or replace function public.fantasy_overview(p_league_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; current_season_id uuid;
begin
  perform public.require_fantasy_enabled();
  if not exists(select 1 from public.fantasy_league_members where league_id=p_league_id and user_id=auth.uid()) then raise exception 'Not a league member.'; end if;
  select id into current_season_id from public.fantasy_seasons where league_id=p_league_id order by season_number desc limit 1;
  select jsonb_build_object(
    'league',to_jsonb(l),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name,'joined_at',m.joined_at) order by m.joined_at) from public.fantasy_league_members m join public.profiles p on p.user_id=m.user_id where m.league_id=l.id),'[]'::jsonb),
    'season',(select to_jsonb(s) from public.fantasy_seasons s where s.id=current_season_id),
    'draftOrder',coalesce((select jsonb_agg(to_jsonb(o) order by o.position) from public.fantasy_draft_order o where o.season_id=current_season_id),'[]'::jsonb),
    'picks',coalesce((select jsonb_agg(to_jsonb(pick)||jsonb_build_object('snack_name',s.name) order by pick.pick_number) from public.fantasy_picks pick join public.snacks s on s.id=pick.snack_id where pick.season_id=current_season_id),'[]'::jsonb),
    'roster',coalesce((select jsonb_agg(to_jsonb(slot)||jsonb_build_object('snack_name',s.name) order by slot.user_id,slot.category) from public.fantasy_roster_slots slot join public.snacks s on s.id=slot.snack_id where slot.season_id=current_season_id and slot.effective_to is null),'[]'::jsonb),
    'preferences',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'category',s.category,'brand',s.brand) order by pref.rank)
      from public.fantasy_preferences pref join public.snacks s on s.id=pref.snack_id and s.merged_into_id is null
      where pref.season_id=current_season_id and pref.user_id=auth.uid()),'[]'::jsonb),
    'standings',coalesce((select jsonb_agg(to_jsonb(score) order by score.points desc) from public.fantasy_standings(current_season_id) score),'[]'::jsonb),
    'archive',coalesce((
      select jsonb_agg(jsonb_build_object(
        'season',to_jsonb(history),
        'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',o.user_id,'display_name',p.display_name) order by o.position) from public.fantasy_draft_order o join public.profiles p on p.user_id=o.user_id where o.season_id=history.id),'[]'::jsonb),
        'roster',coalesce((select jsonb_agg(to_jsonb(slot)||jsonb_build_object('snack_name',s.name) order by slot.user_id,slot.category) from public.fantasy_roster_slots slot join public.snacks s on s.id=slot.snack_id where slot.season_id=history.id and slot.effective_to is null),'[]'::jsonb),
        'standings',coalesce((select jsonb_agg(to_jsonb(score) order by score.points desc) from public.fantasy_standings(history.id) score),'[]'::jsonb)
      ) order by history.season_number desc)
      from public.fantasy_seasons history where history.league_id=l.id and history.status='complete'
    ),'[]'::jsonb)
  ) into result from public.fantasy_leagues l where l.id=p_league_id;
  return result;
end
$$;
