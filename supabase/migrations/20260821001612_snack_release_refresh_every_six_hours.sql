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
    '17 */6 * * *',
    'select public.invoke_snack_release_feed()'
  );
end
$$;

select public.invoke_snack_release_feed();
