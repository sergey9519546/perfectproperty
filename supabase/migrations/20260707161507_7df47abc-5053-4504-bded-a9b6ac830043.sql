-- Extensions live in the `extensions` schema on Supabase
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- Store the cron shared secret in vault so pg_cron can read it without
-- baking a literal into cron.job (which is world-readable to superusers).
-- Idempotent: only create if missing.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      '5b7d440b4570c08962d416b905a05db53cd06b522799dec3f91cee1ebef58840',
      'cron_secret'
    );
  end if;
end $$;

-- Drop any previous schedule with the same name so this migration is rerunnable.
select cron.unschedule('run-recipes-every-6h')
  where exists (select 1 from cron.job where jobname = 'run-recipes-every-6h');

-- Every 6 hours (00:15, 06:15, 12:15, 18:15 UTC) POST to the stable prod URL.
select cron.schedule(
  'run-recipes-every-6h',
  '15 */6 * * *',
  $cron$
  select net.http_post(
    url := 'https://project--3e8bba9e-afd4-4c85-ab23-acf538526a37.lovable.app/api/public/run-recipes',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $cron$
);
