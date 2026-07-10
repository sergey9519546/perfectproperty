
-- 1. Role infrastructure
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- 2. Restrict all previously-public tables to authenticated readers
drop policy if exists counties_read on public.counties;
create policy counties_read on public.counties for select to authenticated using (true);

drop policy if exists deeds_read on public.deeds;
create policy deeds_read on public.deeds for select to authenticated using (true);

drop policy if exists distress_read on public.distress_events;
create policy distress_read on public.distress_events for select to authenticated using (true);

drop policy if exists runs_read on public.ingestion_runs;
create policy runs_read on public.ingestion_runs for select to authenticated using (true);

drop policy if exists listings_read on public.listings;
create policy listings_read on public.listings for select to authenticated using (true);

drop policy if exists scores_read on public.parcel_scores;
create policy scores_read on public.parcel_scores for select to authenticated using (true);

drop policy if exists parcels_read on public.parcels;
create policy parcels_read on public.parcels for select to authenticated using (true);

drop policy if exists "Portfolio metrics are public read" on public.portfolio_metrics;
create policy portfolio_metrics_read on public.portfolio_metrics for select to authenticated using (true);

drop policy if exists outcomes_read on public.prediction_outcomes;
create policy outcomes_read on public.prediction_outcomes for select to authenticated using (true);

drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select to authenticated using (true);

-- 3. Tighten adapter_recipes: only admins can mutate
drop policy if exists "adapter_recipes insert" on public.adapter_recipes;
drop policy if exists "adapter_recipes update" on public.adapter_recipes;
drop policy if exists "adapter_recipes delete" on public.adapter_recipes;

create policy "adapter_recipes insert" on public.adapter_recipes
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "adapter_recipes update" on public.adapter_recipes
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "adapter_recipes delete" on public.adapter_recipes
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
