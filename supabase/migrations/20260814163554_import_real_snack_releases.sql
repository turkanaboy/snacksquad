delete from public.snack_releases where article_url is null;

alter table public.snack_releases
  alter column article_url set not null,
  add constraint snack_releases_article_url_key unique (article_url);

create or replace function public.invoke_snack_release_feed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'snack_squad_project_url';

  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'snack_squad_service_role_key';

  if project_url is null or service_key is null then
    return;
  end if;

  perform net.http_post(
    url => rtrim(project_url, '/') || '/functions/v1/snack-releases',
    headers => jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body => '{}'::jsonb,
    timeout_milliseconds => 10000
  );
end
$$;

revoke execute on function public.invoke_snack_release_feed()
from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'snack-release-feed-refresh';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'snack-release-feed-refresh',
    '17 12 * * *',
    'select public.invoke_snack_release_feed()'
  );
end
$$;
