
create table if not exists public.probe_cache (
  url          text primary key,
  tier         text not null,
  http_status  int  not null,
  final_url    text,
  content_type text,
  bytes        int  not null default 0,
  title        text,
  text_preview text,
  html         text,
  fetched_at   timestamptz not null default now()
);

create table if not exists public.probe_runs (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  tier        text not null,
  status      text not null,
  http_status int,
  bytes       int,
  duration_ms int,
  note        text,
  started_at  timestamptz not null default now()
);
create index if not exists probe_runs_started_idx on public.probe_runs (started_at desc);

grant select on public.probe_cache to authenticated;
grant all    on public.probe_cache to service_role;
grant select on public.probe_runs  to authenticated;
grant all    on public.probe_runs  to service_role;

alter table public.probe_cache enable row level security;
alter table public.probe_runs  enable row level security;

create policy "probe_cache read" on public.probe_cache for select to authenticated using (true);
create policy "probe_runs read"  on public.probe_runs  for select to authenticated using (true);
