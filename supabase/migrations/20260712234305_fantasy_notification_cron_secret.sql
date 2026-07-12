create or replace function public.invoke_fantasy_notification_sender()
returns void language plpgsql security definer set search_path = '' as $$
declare project_url text; cron_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='snack_squad_project_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name='snack_squad_fantasy_cron_secret';
  if project_url is null or cron_secret is null then return; end if;
  perform net.http_post(
    url=>rtrim(project_url,'/')||'/functions/v1/fantasy-notifications',
    headers=>jsonb_build_object('X-Fantasy-Cron-Secret',cron_secret,'Content-Type','application/json'),
    body=>'{}'::jsonb,
    timeout_milliseconds=>10000
  );
end
$$;
revoke execute on function public.invoke_fantasy_notification_sender() from public,anon,authenticated;
