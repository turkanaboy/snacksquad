create type public.fantasy_notification_kind as enum ('turn_started','turn_reminder');

create table public.fantasy_notifications (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  pick_number integer not null check (pick_number > 0),
  kind public.fantasy_notification_kind not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  intended_email text not null,
  delivery_email text not null,
  due_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','leased','retry','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (season_id,pick_number,kind)
);
create index fantasy_notifications_due_idx on public.fantasy_notifications(status,due_at,next_attempt_at);
alter table public.fantasy_notifications enable row level security;
revoke all on public.fantasy_notifications from public,anon,authenticated;

create function public.queue_fantasy_turn_notifications(p_season_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  season_record public.fantasy_seasons;
  picker_id uuid;
  picker_email text;
  started_at timestamptz;
begin
  select * into season_record from public.fantasy_seasons where id=p_season_id;
  if season_record.status <> 'drafting' or season_record.pick_deadline is null then return; end if;
  picker_id:=public.fantasy_current_picker(p_season_id,season_record.current_pick);
  if picker_id is null then return; end if;
  select email into picker_email from auth.users where id=picker_id;
  started_at:=coalesce((select max(selected_at) from public.fantasy_picks where season_id=p_season_id),season_record.draft_started_at);
  insert into public.fantasy_notifications(season_id,pick_number,kind,recipient_user_id,intended_email,delivery_email,due_at)
  values
    (p_season_id,season_record.current_pick,'turn_started',picker_id,picker_email,picker_email,started_at),
    (p_season_id,season_record.current_pick,'turn_reminder',picker_id,picker_email,picker_email,season_record.pick_deadline-interval '30 minutes')
  on conflict (season_id,pick_number,kind) do nothing;
end
$$;

create function public.queue_fantasy_initial_turn()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_season uuid;
begin
  for target_season in select distinct season_id from inserted_orders loop
    perform public.queue_fantasy_turn_notifications(target_season);
  end loop;
  return null;
end
$$;
create trigger queue_fantasy_initial_turn
after insert on public.fantasy_draft_order
referencing new table as inserted_orders
for each statement execute function public.queue_fantasy_initial_turn();

create function public.queue_fantasy_next_turn()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='drafting' and new.current_pick<>old.current_pick then
    perform public.queue_fantasy_turn_notifications(new.id);
  end if;
  return new;
end
$$;
create trigger queue_fantasy_next_turn
after update of current_pick on public.fantasy_seasons
for each row execute function public.queue_fantasy_next_turn();

create function public.claim_fantasy_notifications(p_limit integer, p_at timestamptz, p_lease_token uuid)
returns table (
  id uuid, kind public.fantasy_notification_kind, recipient_user_id uuid, delivery_email text,
  league_id uuid, league_name text, pick_number integer, pick_deadline timestamptz
)
language sql security definer set search_path = '' as $$
  with candidates as (
    select notification.id
    from public.fantasy_notifications notification
    join public.fantasy_seasons season on season.id=notification.season_id
    where notification.due_at<=p_at
      and notification.attempt_count<5
      and (
        notification.status='queued'
        or (notification.status='retry' and coalesce(notification.next_attempt_at,notification.due_at)<=p_at)
        or (notification.status='leased' and notification.lease_expires_at<=p_at)
      )
      and season.status='drafting'
      and season.current_pick=notification.pick_number
    order by notification.due_at,notification.id
    for update of notification skip locked
    limit least(greatest(coalesce(p_limit,10),1),50)
  ), leased as (
    update public.fantasy_notifications notification
    set status='leased',lease_token=p_lease_token,lease_expires_at=p_at+interval '2 minutes'
    from candidates where notification.id=candidates.id
    returning notification.*
  )
  select leased.id,leased.kind,leased.recipient_user_id,leased.delivery_email,league.id,league.name,leased.pick_number,season.pick_deadline
  from leased join public.fantasy_seasons season on season.id=leased.season_id
  join public.fantasy_leagues league on league.id=season.league_id
$$;

create function public.complete_fantasy_notification(p_id uuid, p_lease_token uuid, p_provider_message_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fantasy_notifications set status='sent',provider_message_id=p_provider_message_id,sent_at=now(),
    lease_token=null,lease_expires_at=null,last_error=null
  where id=p_id and status='leased' and lease_token=p_lease_token;
  if not found then raise exception 'Notification lease is not current.'; end if;
end
$$;

create function public.fail_fantasy_notification(p_id uuid, p_lease_token uuid, p_error text, p_next_attempt_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fantasy_notifications set attempt_count=attempt_count+1,
    status=case when attempt_count+1>=5 then 'failed' else 'retry' end,
    next_attempt_at=case when attempt_count+1>=5 then null else p_next_attempt_at end,
    lease_token=null,lease_expires_at=null,last_error=left(coalesce(p_error,'Unknown delivery failure'),1000)
  where id=p_id and status='leased' and lease_token=p_lease_token;
  if not found then raise exception 'Notification lease is not current.'; end if;
end
$$;

revoke execute on function public.queue_fantasy_turn_notifications(uuid),public.queue_fantasy_initial_turn(),
  public.queue_fantasy_next_turn(),public.claim_fantasy_notifications(integer,timestamptz,uuid),
  public.complete_fantasy_notification(uuid,uuid,text),public.fail_fantasy_notification(uuid,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.claim_fantasy_notifications(integer,timestamptz,uuid),
  public.complete_fantasy_notification(uuid,uuid,text),public.fail_fantasy_notification(uuid,uuid,text,timestamptz)
  to service_role;

create extension if not exists pg_net with schema extensions;
create function public.invoke_fantasy_notification_sender()
returns void language plpgsql security definer set search_path = '' as $$
declare project_url text; service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='snack_squad_project_url';
  select decrypted_secret into service_key from vault.decrypted_secrets where name='snack_squad_service_role_key';
  if project_url is null or service_key is null then return; end if;
  perform net.http_post(
    url=>rtrim(project_url,'/')||'/functions/v1/fantasy-notifications',
    headers=>jsonb_build_object('Authorization','Bearer '||service_key,'Content-Type','application/json'),
    body=>'{}'::jsonb,
    timeout_milliseconds=>10000
  );
end
$$;
revoke execute on function public.invoke_fantasy_notification_sender() from public,anon,authenticated;
do $$ declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='fantasy-notification-sender';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('fantasy-notification-sender','* * * * *','select public.invoke_fantasy_notification_sender()');
end $$;
