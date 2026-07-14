drop function public.submit_fantasy_pick(uuid,uuid);
drop function public.submit_fantasy_pick(uuid,uuid,timestamptz);

create function public.submit_fantasy_pick(p_season_id uuid, p_snack_id uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz;
begin
  perform public.require_fantasy_enabled();
  select pick_deadline into deadline from public.fantasy_seasons where id=p_season_id;
  if deadline is null or p_at>deadline then raise exception 'The pick clock expired.'; end if;
  perform public.make_fantasy_pick(p_season_id,auth.uid(),p_snack_id,false,p_at);
end
$$;

create function public.submit_fantasy_pick(p_season_id uuid, p_snack_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.submit_fantasy_pick(p_season_id,p_snack_id,now())
$$;

revoke execute on function public.submit_fantasy_pick(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke execute on function public.submit_fantasy_pick(uuid,uuid) from public,anon;
grant execute on function public.submit_fantasy_pick(uuid,uuid) to authenticated;
