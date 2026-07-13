-- Realie request budgeting and response caches.
--
-- The API is billed per HTTP request, so reservations are counted before a
-- request is sent. The single orchestrator_config row is locked briefly by
-- reserve_realie_call(), which makes the global daily cap safe even when
-- several workers call different endpoints concurrently.

-- Stable transfer IDs make repeated normalization of Realie's transfer array
-- idempotent, just as source_event_id does for distress events.
ALTER TABLE public.deeds
  ADD COLUMN IF NOT EXISTS source_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS deeds_source_event_idx
  ON public.deeds (data_source, source_event_id);

-- Normalize provider-specific distress labels before they reach the queue's
-- constrained reason column. Realie emits labels such as FORECLOSURE_NOD and
-- AUCTION_SCHEDULED, while the queue intentionally has broader categories.
CREATE OR REPLACE FUNCTION public.tg_enqueue_from_distress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text := replace(replace(lower(COALESCE(NEW.event_type, '')), '-', '_'), ' ', '_');
  v_reason text;
  v_priority integer;
BEGIN
  v_reason := CASE
    WHEN v_event_type LIKE '%foreclos%'
      OR v_event_type LIKE '%auction%'
      OR v_event_type IN ('nod', 'notice_of_default', 'notice_of_sale', 'lis_pendens')
      THEN 'foreclosure'
    WHEN v_event_type LIKE 'probate%' THEN 'probate'
    WHEN v_event_type LIKE 'code_violation%' THEN 'code_violation'
    WHEN v_event_type LIKE 'tax_lien%' THEN 'tax_lien'
    ELSE 'manual'
  END;

  v_priority := CASE v_reason
    WHEN 'foreclosure' THEN 300
    WHEN 'probate' THEN 250
    WHEN 'code_violation' THEN 200
    WHEN 'tax_lien' THEN 220
    ELSE 150
  END;

  PERFORM public.enqueue_enrichment_for_parcel(NEW.parcel_id, v_reason, v_priority);
  RETURN NEW;
END;
$$;

ALTER TABLE public.orchestrator_config
  ADD COLUMN IF NOT EXISTS realie_daily_call_limit integer NOT NULL DEFAULT 100
    CHECK (realie_daily_call_limit >= 0),
  ADD COLUMN IF NOT EXISTS realie_interactive_reserve integer NOT NULL DEFAULT 20
    CHECK (realie_interactive_reserve >= 0),
  ADD COLUMN IF NOT EXISTS realie_property_cache_ttl_days integer NOT NULL DEFAULT 90
    CHECK (realie_property_cache_ttl_days >= 1),
  ADD COLUMN IF NOT EXISTS realie_comp_cache_ttl_days integer NOT NULL DEFAULT 21
    CHECK (realie_comp_cache_ttl_days >= 1),
  ADD COLUMN IF NOT EXISTS realie_negative_cache_ttl_days integer NOT NULL DEFAULT 30
    CHECK (realie_negative_cache_ttl_days >= 1);

COMMENT ON COLUMN public.orchestrator_config.realie_daily_call_limit IS
  'Hard cap on reserved Realie HTTP requests per UTC day across all endpoints.';
COMMENT ON COLUMN public.orchestrator_config.realie_interactive_reserve IS
  'Requests held back from background workers for user-initiated lookups.';
COMMENT ON COLUMN public.orchestrator_config.realie_daily_budget_usd IS
  'Planning/alerting budget retained for compatibility; request_count is the enforced limit.';

CREATE TABLE public.realie_property_snapshots (
  provider_parcel_id text PRIMARY KEY CHECK (btrim(provider_parcel_id) <> ''),
  parcel_id uuid NULL REFERENCES public.parcels(id) ON DELETE SET NULL,
  lookup_key text NULL,
  endpoint text NOT NULL CHECK (btrim(endpoint) <> ''),
  match_method text NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash text NOT NULL CHECK (btrim(payload_hash) <> ''),
  provider_request_id text NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > fetched_at)
);

COMMENT ON TABLE public.realie_property_snapshots IS
  'Latest complete Realie property response, stored once per Realie parcel ID and refreshed in place.';

CREATE INDEX realie_property_snapshots_parcel_idx
  ON public.realie_property_snapshots (parcel_id)
  WHERE parcel_id IS NOT NULL;
CREATE INDEX realie_property_snapshots_lookup_idx
  ON public.realie_property_snapshots (lookup_key)
  WHERE lookup_key IS NOT NULL;
CREATE INDEX realie_property_snapshots_expiry_idx
  ON public.realie_property_snapshots (expires_at);

CREATE TABLE public.realie_negative_cache (
  lookup_key text PRIMARY KEY CHECK (btrim(lookup_key) <> ''),
  endpoint text NOT NULL CHECK (btrim(endpoint) <> ''),
  reason text NOT NULL,
  status_code integer NULL,
  last_error text NULL,
  hit_count bigint NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > fetched_at)
);

COMMENT ON TABLE public.realie_negative_cache IS
  'Short-lived misses keyed by normalized lookup input to prevent repeated paid no-result calls.';

CREATE INDEX realie_negative_cache_expiry_idx
  ON public.realie_negative_cache (expires_at);

CREATE TABLE public.realie_comp_cache (
  cache_key text PRIMARY KEY CHECK (btrim(cache_key) <> ''),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  comparables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(comparables) = 'array'),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > fetched_at)
);

COMMENT ON TABLE public.realie_comp_cache IS
  'Premium comparable responses shared by subjects with the same normalized location and filters.';

CREATE INDEX realie_comp_cache_expiry_idx
  ON public.realie_comp_cache (expires_at);

CREATE TABLE public.realie_usage_daily (
  usage_date date NOT NULL,
  endpoint text NOT NULL CHECK (btrim(endpoint) <> ''),
  request_count bigint NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  success_count bigint NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count bigint NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  property_count bigint NOT NULL DEFAULT 0 CHECK (property_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_date, endpoint)
);

COMMENT ON TABLE public.realie_usage_daily IS
  'UTC-day request reservations and outcomes by Realie endpoint.';

CREATE INDEX realie_usage_daily_date_idx
  ON public.realie_usage_daily (usage_date DESC);

CREATE TRIGGER trg_realie_property_snapshots_updated
  BEFORE UPDATE ON public.realie_property_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_realie_negative_cache_updated
  BEFORE UPDATE ON public.realie_negative_cache
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_realie_comp_cache_updated
  BEFORE UPDATE ON public.realie_comp_cache
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_realie_usage_daily_updated
  BEFORE UPDATE ON public.realie_usage_daily
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

GRANT SELECT ON public.realie_property_snapshots TO authenticated;
GRANT SELECT ON public.realie_negative_cache TO authenticated;
GRANT SELECT ON public.realie_comp_cache TO authenticated;
GRANT SELECT ON public.realie_usage_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realie_property_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realie_negative_cache TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realie_comp_cache TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realie_usage_daily TO service_role;

ALTER TABLE public.realie_property_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realie_negative_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realie_comp_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realie_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read realie property snapshots"
  ON public.realie_property_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service manages realie property snapshots"
  ON public.realie_property_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admins read realie negative cache"
  ON public.realie_negative_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service manages realie negative cache"
  ON public.realie_negative_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admins read realie comp cache"
  ON public.realie_comp_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service manages realie comp cache"
  ON public.realie_comp_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admins read realie usage"
  ON public.realie_usage_daily FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service manages realie usage"
  ON public.realie_usage_daily FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reserve_realie_call(
  p_endpoint text,
  p_budget_class text DEFAULT 'background'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_endpoint text := left(btrim(p_endpoint), 200);
  v_usage_date date := (timezone('utc', now()))::date;
  v_daily_limit integer;
  v_interactive_reserve integer;
  v_allowed integer;
  v_used bigint;
BEGIN
  IF v_endpoint IS NULL OR v_endpoint = '' THEN
    RAISE EXCEPTION 'reserve_realie_call requires an endpoint';
  END IF;
  IF p_budget_class IS NULL OR p_budget_class NOT IN ('background', 'interactive') THEN
    RAISE EXCEPTION 'invalid Realie budget class: %', p_budget_class;
  END IF;

  -- This row lock serializes the short read/check/increment section across
  -- every endpoint, so the sum cannot race past the configured global cap.
  SELECT realie_daily_call_limit, realie_interactive_reserve
  INTO v_daily_limit, v_interactive_reserve
  FROM public.orchestrator_config
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orchestrator_config row 1 is missing';
  END IF;

  v_interactive_reserve := LEAST(v_daily_limit, v_interactive_reserve);
  v_allowed := CASE
    WHEN p_budget_class = 'interactive' THEN v_daily_limit
    ELSE GREATEST(v_daily_limit - v_interactive_reserve, 0)
  END;

  SELECT COALESCE(sum(request_count), 0)
  INTO v_used
  FROM public.realie_usage_daily
  WHERE usage_date = v_usage_date;

  IF v_used >= v_allowed THEN
    RETURN false;
  END IF;

  INSERT INTO public.realie_usage_daily (usage_date, endpoint, request_count)
  VALUES (v_usage_date, v_endpoint, 1)
  ON CONFLICT (usage_date, endpoint) DO UPDATE
  SET request_count = public.realie_usage_daily.request_count + 1,
      updated_at = now();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_realie_call_result(
  p_endpoint text,
  p_success boolean,
  p_property_count integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_endpoint text := left(btrim(p_endpoint), 200);
  v_usage_date date := (timezone('utc', now()))::date;
BEGIN
  IF v_endpoint IS NULL OR v_endpoint = '' THEN
    RAISE EXCEPTION 'record_realie_call_result requires an endpoint';
  END IF;
  IF p_success IS NULL THEN
    RAISE EXCEPTION 'record_realie_call_result requires a success value';
  END IF;
  IF p_property_count < 0 THEN
    RAISE EXCEPTION 'property count cannot be negative';
  END IF;

  UPDATE public.realie_usage_daily
  SET success_count = success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
      failure_count = failure_count + CASE WHEN p_success THEN 0 ELSE 1 END,
      property_count = property_count + p_property_count,
      updated_at = now()
  WHERE usage_date = v_usage_date
    AND endpoint = v_endpoint;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no reserved Realie call exists for endpoint % today', v_endpoint;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_realie_call(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_realie_call_result(text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_realie_call(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_realie_call_result(text, boolean, integer) TO service_role;

-- Recreate by name so rerunning this migration cannot create duplicate jobs.
SELECT cron.unschedule('run-realie-enrichment-every-15m')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'run-realie-enrichment-every-15m'
);

SELECT cron.schedule(
  'run-realie-enrichment-every-15m',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--3e8bba9e-afd4-4c85-ab23-acf538526a37.lovable.app/api/public/run-realie-enrichment',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'cron_secret'
        LIMIT 1
      )
    ),
    body := '{"batch":100}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $cron$
);
