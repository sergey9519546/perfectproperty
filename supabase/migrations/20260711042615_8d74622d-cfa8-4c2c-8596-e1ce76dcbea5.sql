
-- ingestion_failures (DLQ)
CREATE TABLE public.ingestion_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  stage text NOT NULL,
  parcel_ref text,
  county_fips text,
  error_message text NOT NULL,
  stack text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ingestion_failures TO authenticated;
GRANT ALL ON public.ingestion_failures TO service_role;
ALTER TABLE public.ingestion_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read failures" ON public.ingestion_failures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX ingestion_failures_created_idx ON public.ingestion_failures (created_at DESC);
CREATE INDEX ingestion_failures_source_idx ON public.ingestion_failures (source, created_at DESC);

-- source_health (circuit breaker state)
CREATE TABLE public.source_health (
  source_key text PRIMARY KEY,
  county_fips text,
  status text NOT NULL DEFAULT 'green', -- green|yellow|red
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  last_error text,
  consecutive_failures int NOT NULL DEFAULT 0,
  tripped_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.source_health TO authenticated;
GRANT ALL ON public.source_health TO service_role;
ALTER TABLE public.source_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read source_health" ON public.source_health
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
