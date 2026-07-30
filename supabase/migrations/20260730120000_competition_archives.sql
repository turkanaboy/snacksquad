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

create function public.bracket_archive(p_limit integer default 12)
returns table (week_id uuid, week_start date, first_place jsonb, second_place jsonb, third_place jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query
  select w.id,w.week_start,
    (select jsonb_build_object('entry_id',e.id,'snack_name',s.name) from public.bracket_entries e join public.snacks s on s.id=e.snack_id where e.id=w.champion_entry_id),
    (select jsonb_build_object('entry_id',e.id,'snack_name',s.name)
      from public.bracket_matchups final
      join public.bracket_entries e on e.id=case when final.winner_entry_id=final.left_entry_id then final.right_entry_id else final.left_entry_id end
      join public.snacks s on s.id=e.snack_id
      where final.week_id=w.id and final.round_number=4 and final.position=1),
    coalesce((select jsonb_agg(jsonb_build_object('entry_id',e.id,'snack_name',s.name) order by e.seed,e.id)
      from public.bracket_matchups semifinal
      join public.bracket_entries e on e.id=case when semifinal.winner_entry_id=semifinal.left_entry_id then semifinal.right_entry_id else semifinal.left_entry_id end
      join public.snacks s on s.id=e.snack_id
      where semifinal.week_id=w.id and semifinal.round_number=3 and semifinal.winner_entry_id is not null),'[]'::jsonb)
  from public.bracket_weeks w
  where w.status='results' and w.champion_entry_id is not null
  order by w.week_start desc
  limit least(greatest(coalesce(p_limit,12),1),52);
end
$$;

revoke execute on function public.bracket_archive(integer) from public,anon;
grant execute on function public.bracket_archive(integer) to authenticated;
