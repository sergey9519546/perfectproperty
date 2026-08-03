CREATE TABLE IF NOT EXISTS public.realie_property_snapshots (
  provider_parcel_id text PRIMARY KEY,
  parcel_id uuid REFERENCES public.parcels(id) ON DELETE SET NULL,
  lookup_key text,
  payload jsonb NOT NULL,
  payload_hash text,
  endpoint text,
  match_method text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);
CREATE INDEX IF NOT EXISTS realie_snapshots_parcel_idx ON public.realie_property_snapshots(parcel_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS realie_snapshots_lookup_idx ON public.realie_property_snapshots(lookup_key, expires_at DESC);
GRANT ALL ON public.realie_property_snapshots TO service_role;
ALTER TABLE public.realie_property_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_realie_snapshots" ON public.realie_property_snapshots
  TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.realie_negative_cache (
  lookup_key text PRIMARY KEY,
  endpoint text,
  reason text NOT NULL DEFAULT 'address_not_found',
  status_code integer,
  hit_count integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX IF NOT EXISTS realie_negative_cache_expiry_idx ON public.realie_negative_cache(expires_at);
GRANT ALL ON public.realie_negative_cache TO service_role;
ALTER TABLE public.realie_negative_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_realie_negative_cache" ON public.realie_negative_cache
  TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.orchestrator_config
  ADD COLUMN IF NOT EXISTS realie_property_cache_ttl_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS realie_negative_cache_ttl_days integer NOT NULL DEFAULT 30;