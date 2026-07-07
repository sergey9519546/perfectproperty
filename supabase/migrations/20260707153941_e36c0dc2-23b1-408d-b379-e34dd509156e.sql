
create table if not exists public.adapter_recipes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  target_table       text not null check (target_table in ('distress_events','sales','parcels')),
  source_url         text not null,
  url_pattern        text,
  container_selector text not null,
  fields             jsonb not null default '[]'::jsonb,
  notes              text,
  last_run_at        timestamptz,
  last_run_rows      int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists adapter_recipes_target_idx on public.adapter_recipes (target_table);

grant select, insert, update, delete on public.adapter_recipes to authenticated;
grant all on public.adapter_recipes to service_role;

alter table public.adapter_recipes enable row level security;

create policy "adapter_recipes read"   on public.adapter_recipes for select to authenticated using (true);
create policy "adapter_recipes insert" on public.adapter_recipes for insert to authenticated with check (true);
create policy "adapter_recipes update" on public.adapter_recipes for update to authenticated using (true) with check (true);
create policy "adapter_recipes delete" on public.adapter_recipes for delete to authenticated using (true);
