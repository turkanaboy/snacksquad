create or replace function public.contest_overview(p_week_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select jsonb_build_object(
    'week', to_jsonb(w),
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'snack_id', e.snack_id,
          'seed', e.seed,
          'snack_name', s.name,
          'category', s.category,
          'image_url', s.image_url
        ) order by e.seed nulls last, e.created_at
      )
      from public.bracket_entries e
      join public.snacks s on s.id = e.snack_id
      where e.week_id = w.id
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.nominated_at)
      from public.bracket_entry_owners o
      where o.week_id = w.id
    ), '[]'::jsonb),
    'matchups', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'left_vote_count', (select count(*) from public.bracket_votes v where v.matchup_id = m.id and v.entry_id = m.left_entry_id),
          'right_vote_count', (select count(*) from public.bracket_votes v where v.matchup_id = m.id and v.entry_id = m.right_entry_id)
        ) order by m.round_number, m.position
      )
      from public.bracket_matchups m
      where m.week_id = w.id
    ), '[]'::jsonb),
    'viewerVotes', coalesce((
      select jsonb_agg(to_jsonb(v))
      from public.bracket_votes v
      join public.bracket_matchups m on m.id = v.matchup_id
      where m.week_id = w.id and v.user_id = auth.uid()
    ), '[]'::jsonb)
  ) into result
  from public.bracket_weeks w
  where w.id = p_week_id;

  return result;
end
$$;

revoke execute on function public.contest_overview(uuid) from public, anon;
grant execute on function public.contest_overview(uuid) to authenticated;
