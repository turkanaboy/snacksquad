create function public.auto_draft_fantasy_bots(p_at timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare season_id uuid; picked integer:=0;
begin
  loop
    select season.id into season_id
    from public.fantasy_seasons season
    join public.fantasy_leagues league on league.id=season.league_id and league.test_run_id is null
    join auth.users actor on actor.id=public.fantasy_current_picker(season.id,season.current_pick)
    where season.status='drafting'
      and coalesce(actor.raw_app_meta_data->>'snack_squad_test_bot','false')='true'
    order by season.draft_started_at,season.id
    for update of season skip locked limit 1;
    exit when season_id is null;
    perform public.auto_pick_fantasy(season_id,p_at);
    picked:=picked+1;
  end loop;
  return picked;
end
$$;

create or replace function public.queue_fantasy_turn_notifications(p_season_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  season_record public.fantasy_seasons; picker_id uuid; picker_email text; target_email text;
  started_at timestamptz; reminder interval:=interval '30 minutes'; run_label text;
begin
  select * into season_record from public.fantasy_seasons where id=p_season_id;
  if season_record.status<>'drafting' or season_record.pick_deadline is null then return; end if;
  picker_id:=public.fantasy_current_picker(p_season_id,season_record.current_pick);
  if picker_id is null then return; end if;
  select email into picker_email from auth.users where id=picker_id;
  select run.label,run.reminder_before into run_label,reminder from public.fantasy_test_actors actor
  join public.fantasy_test_runs run on run.id=actor.run_id where actor.user_id=picker_id;
  if run_label is null and coalesce((select raw_app_meta_data->>'snack_squad_test_bot' from auth.users where id=picker_id),'false')='true' then return; end if;
  reminder:=coalesce(reminder,interval '30 minutes');
  target_email:=case when run_label is null then picker_email else 'delivered+'||run_label||'-'||left(replace(picker_id::text,'-',''),8)||'@resend.dev' end;
  started_at:=coalesce((select max(selected_at) from public.fantasy_picks where season_id=p_season_id),season_record.draft_started_at);
  insert into public.fantasy_notifications(season_id,pick_number,kind,recipient_user_id,intended_email,delivery_email,due_at)
  values
    (p_season_id,season_record.current_pick,'turn_started',picker_id,picker_email,target_email,started_at),
    (p_season_id,season_record.current_pick,'turn_reminder',picker_id,picker_email,target_email,season_record.pick_deadline-reminder)
  on conflict (season_id,pick_number,kind) do nothing;
end
$$;

revoke execute on function public.auto_draft_fantasy_bots(timestamptz) from public,anon,authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='fantasy-live-bot-auto-draft';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('fantasy-live-bot-auto-draft','* * * * *','select public.auto_draft_fantasy_bots()');
end
$$;
