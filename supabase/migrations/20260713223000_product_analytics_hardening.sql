-- Forward-only hardening for the product analytics foundation.
-- Keep the already-published 20260713220000 migration immutable.

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
    'landing_view',
    'story_viewed',
    'workspace_opened',
    'market_selected',
    'evidence_viewed',
    'underwrite_requested',
    'underwrite_succeeded',
    'underwrite_failed',
    'brief_export_requested',
    'brief_export_succeeded',
    'brief_export_failed',
    'media_error',
    'web_vital'
  ));

CREATE OR REPLACE FUNCTION public.record_product_event(
  p_client_event_id uuid,
  p_event_name text,
  p_occurred_at timestamptz,
  p_session_id uuid,
  p_anonymous_id uuid,
  p_user_id uuid,
  p_route text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_success boolean DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_experiment_id text DEFAULT NULL,
  p_experiment_variant text DEFAULT NULL,
  p_device_class text DEFAULT NULL,
  p_reduced_motion boolean DEFAULT false,
  p_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_occurred_at timestamptz;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_events WHERE client_event_id = p_client_event_id
  ) THEN
    RETURN true;
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_events
    WHERE session_id = p_session_id
      AND received_at >= now() - interval '1 minute'
  ) >= 90 THEN
    RETURN false;
  END IF;

  v_occurred_at := CASE
    WHEN p_occurred_at BETWEEN now() - interval '24 hours' AND now() + interval '5 minutes'
      THEN p_occurred_at
    ELSE now()
  END;

  INSERT INTO public.product_events (
    client_event_id, event_name, occurred_at, session_id, anonymous_id,
    user_id, route, entity_type, entity_id, success, duration_ms,
    experiment_id, experiment_variant, device_class, reduced_motion, properties
  ) VALUES (
    p_client_event_id, p_event_name, v_occurred_at, p_session_id, p_anonymous_id,
    p_user_id, p_route, p_entity_type, p_entity_id, p_success, p_duration_ms,
    p_experiment_id, p_experiment_variant, p_device_class, p_reduced_motion,
    COALESCE(p_properties, '{}'::jsonb)
  )
  ON CONFLICT (client_event_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workflow_action(
  p_client_event_id uuid,
  p_action_type text,
  p_occurred_at timestamptz,
  p_session_id uuid,
  p_anonymous_id uuid,
  p_user_id uuid,
  p_route text,
  p_market_id text,
  p_market_name text,
  p_device_class text,
  p_reduced_motion boolean,
  p_record_analytics boolean,
  p_input_snapshot jsonb DEFAULT '{}'::jsonb,
  p_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_id uuid;
  v_event_name text;
  v_occurred_at timestamptz;
BEGIN
  IF p_action_type NOT IN ('underwrite', 'brief_export') THEN
    RAISE EXCEPTION 'Unsupported workflow action';
  END IF;

  SELECT id INTO v_action_id
  FROM public.workflow_actions
  WHERE client_event_id = p_client_event_id;
  IF v_action_id IS NOT NULL THEN
    RETURN v_action_id;
  END IF;

  IF (
    SELECT count(*)
    FROM public.workflow_actions
    WHERE session_id = p_session_id
      AND created_at >= now() - interval '1 minute'
  ) >= 20 THEN
    RAISE EXCEPTION 'Workflow action rate limit exceeded';
  END IF;

  v_occurred_at := CASE
    WHEN p_occurred_at BETWEEN now() - interval '24 hours' AND now() + interval '5 minutes'
      THEN p_occurred_at
    ELSE now()
  END;
  v_event_name := CASE p_action_type
    WHEN 'underwrite' THEN 'underwrite_succeeded'
    ELSE 'brief_export_succeeded'
  END;

  INSERT INTO public.workflow_actions (
    client_event_id, action_type, session_id, anonymous_id, user_id,
    market_id, market_name, input_snapshot
  ) VALUES (
    p_client_event_id, p_action_type, p_session_id, p_anonymous_id, p_user_id,
    p_market_id, p_market_name, COALESCE(p_input_snapshot, '{}'::jsonb)
  )
  ON CONFLICT (client_event_id) DO UPDATE
    SET client_event_id = EXCLUDED.client_event_id
  RETURNING id INTO v_action_id;

  IF COALESCE(p_record_analytics, false) THEN
    INSERT INTO public.product_events (
      client_event_id, event_name, occurred_at, session_id, anonymous_id,
      user_id, route, entity_type, entity_id, success, device_class,
      reduced_motion, properties
    ) VALUES (
      p_client_event_id, v_event_name, v_occurred_at, p_session_id, p_anonymous_id,
      p_user_id, p_route, 'market', p_market_id, true, p_device_class,
      COALESCE(p_reduced_motion, false),
      COALESCE(p_properties, '{}'::jsonb) || jsonb_build_object('action_id', v_action_id)
    )
    ON CONFLICT (client_event_id) DO NOTHING;
  END IF;

  RETURN v_action_id;
END;
$$;

DROP VIEW IF EXISTS public.product_kpi_daily;
CREATE VIEW public.product_kpi_daily AS
WITH session_starts AS (
  SELECT
    session_id,
    anonymous_id,
    min(received_at) AS session_started_at,
    min(received_at) FILTER (WHERE event_name = 'landing_view') AS landing_at,
    min(received_at) FILTER (
      WHERE event_name = 'story_viewed' AND duration_ms >= 5000
    ) AS story_at,
    min(received_at) FILTER (WHERE event_name = 'workspace_opened') AS workspace_at,
    min(received_at) FILTER (WHERE event_name = 'evidence_viewed') AS evidence_at
  FROM public.product_events
  GROUP BY session_id, anonymous_id
), sessions AS (
  SELECT
    starts.*,
    action.action_at
  FROM session_starts starts
  LEFT JOIN LATERAL (
    SELECT min(event.received_at) AS action_at
    FROM public.product_events event
    WHERE event.session_id = starts.session_id
      AND event.event_name IN ('underwrite_succeeded', 'brief_export_succeeded')
      AND event.received_at >= starts.workspace_at
  ) action ON starts.workspace_at IS NOT NULL
), market_journeys AS (
  SELECT
    sessions.session_id,
    market.entity_id AS market_id,
    market.received_at AS market_at,
    evidence.evidence_at,
    action.action_at
  FROM sessions
  JOIN public.product_events market
    ON market.session_id = sessions.session_id
   AND market.event_name = 'market_selected'
   AND market.entity_type = 'market'
   AND market.entity_id IS NOT NULL
   AND market.received_at >= sessions.workspace_at
  LEFT JOIN LATERAL (
    SELECT min(event.received_at) AS evidence_at
    FROM public.product_events event
    WHERE event.session_id = sessions.session_id
      AND event.event_name = 'evidence_viewed'
      AND event.entity_type = 'market'
      AND event.entity_id = market.entity_id
      AND event.duration_ms >= 5000
      AND event.received_at >= market.received_at
  ) evidence ON true
  LEFT JOIN LATERAL (
    SELECT min(event.received_at) AS action_at
    FROM public.product_events event
    WHERE event.session_id = sessions.session_id
      AND event.event_name IN ('underwrite_succeeded', 'brief_export_succeeded')
      AND event.entity_type = 'market'
      AND event.entity_id = market.entity_id
      AND event.received_at >= evidence.evidence_at
  ) action ON evidence.evidence_at IS NOT NULL
), session_journeys AS (
  SELECT
    session_id,
    min(action_at) FILTER (WHERE evidence_at IS NOT NULL) AS matched_action_at,
    min(action_at) FILTER (
      WHERE evidence_at IS NOT NULL
        AND action_at <= market_at + interval '30 minutes'
    ) AS qualified_action_at
  FROM market_journeys
  GROUP BY session_id
), qualified AS (
  SELECT
    sessions.*,
    journey.matched_action_at,
    journey.qualified_action_at,
    sessions.landing_at IS NOT NULL
      AND sessions.workspace_at >= sessions.landing_at
      AND journey.qualified_action_at <= sessions.workspace_at + interval '30 minutes'
      AS is_qualified
  FROM sessions
  LEFT JOIN session_journeys journey USING (session_id)
), daily AS (
  SELECT
    date_trunc('day', COALESCE(landing_at, workspace_at, session_started_at))::date AS metric_date,
    count(*) FILTER (WHERE landing_at IS NOT NULL) AS landing_sessions,
    count(*) FILTER (WHERE landing_at IS NOT NULL AND workspace_at >= landing_at) AS workspace_sessions,
    count(*) FILTER (WHERE evidence_at IS NOT NULL) AS evidence_sessions,
    count(*) FILTER (WHERE action_at IS NOT NULL) AS action_sessions,
    count(*) FILTER (WHERE matched_action_at IS NOT NULL) AS evidence_action_sessions,
    count(*) FILTER (WHERE is_qualified) AS qualified_activations,
    count(*) FILTER (WHERE story_at >= landing_at) AS story_exposed_sessions,
    count(*) FILTER (WHERE story_at >= landing_at AND is_qualified) AS story_qualified_activations,
    count(*) FILTER (WHERE (story_at IS NULL OR story_at < landing_at) AND is_qualified) AS unexposed_qualified_activations,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY extract(epoch FROM (action_at - workspace_at))
    ) FILTER (WHERE action_at >= workspace_at) AS median_seconds_to_action
  FROM qualified
  GROUP BY 1
)
SELECT
  metric_date,
  landing_sessions,
  workspace_sessions,
  evidence_sessions,
  action_sessions,
  evidence_action_sessions,
  qualified_activations,
  story_exposed_sessions,
  story_qualified_activations,
  unexposed_qualified_activations,
  round(100.0 * qualified_activations / NULLIF(landing_sessions, 0), 2) AS qualified_activation_rate,
  round(100.0 * workspace_sessions / NULLIF(landing_sessions, 0), 2) AS landing_to_workspace_rate,
  round(100.0 * evidence_action_sessions / NULLIF(evidence_sessions, 0), 2) AS evidence_to_action_rate,
  round(median_seconds_to_action::numeric, 1) AS median_seconds_to_action
FROM daily;

CREATE OR REPLACE VIEW public.product_experience_daily AS
SELECT
  received_at::date AS metric_date,
  round((percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms)
    FILTER (WHERE event_name = 'web_vital' AND properties->>'metric_name' = 'LCP'))::numeric, 1)
    AS p75_lcp_ms,
  round((percentile_cont(0.75) WITHIN GROUP (ORDER BY duration_ms)
    FILTER (WHERE event_name = 'web_vital' AND properties->>'metric_name' = 'INTERACTION_LATENCY'))::numeric, 1)
    AS p75_interaction_latency_ms,
  round((avg(duration_ms)
    FILTER (WHERE event_name = 'web_vital' AND properties->>'metric_name' = 'CLS_MILLI'))::numeric / 1000, 3)
    AS average_cls,
  count(*) FILTER (WHERE event_name = 'media_error') AS media_errors,
  count(DISTINCT session_id) FILTER (WHERE event_name = 'media_error') AS media_error_sessions
FROM public.product_events
GROUP BY 1;

CREATE OR REPLACE FUNCTION public.prune_product_events(p_retention_days integer DEFAULT 400)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF p_retention_days < 30 OR p_retention_days > 730 THEN
    RAISE EXCEPTION 'Retention must be between 30 and 730 days';
  END IF;

  DELETE FROM public.product_events
  WHERE received_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_product_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_product_events(integer) TO service_role;

SELECT cron.unschedule('prune-product-events-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-product-events-weekly');

SELECT cron.schedule(
  'prune-product-events-weekly',
  '23 4 * * 0',
  $cron$ SELECT public.prune_product_events(400); $cron$
);

REVOKE ALL ON public.product_kpi_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_experience_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_kpi_daily TO service_role;
GRANT SELECT ON public.product_experience_daily TO service_role;

COMMENT ON VIEW public.product_kpi_daily IS
  'Session-grain landing-to-workspace KPI rollup. Qualified activation requires a same-market ordered selection, evidence exposure, and server-confirmed workflow action within 30 minutes of workspace entry.';
COMMENT ON VIEW public.product_experience_daily IS
  'First-party experience guardrails measured with browser-native observers. Interaction latency is diagnostic and is not labeled as standards-compliant INP.';
COMMENT ON FUNCTION public.prune_product_events(integer) IS
  'Deletes raw product events older than the bounded retention window. Workflow actions are retained as operational audit records.';
