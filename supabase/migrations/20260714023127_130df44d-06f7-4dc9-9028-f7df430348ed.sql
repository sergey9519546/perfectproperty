-- Apply product analytics schema (was defined in local migration files but never applied to the database).
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION/VIEW.

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL UNIQUE,
  event_name text NOT NULL CHECK (event_name IN (
    'landing_view','story_viewed','workspace_opened','market_selected','evidence_viewed',
    'underwrite_requested','underwrite_succeeded','underwrite_failed',
    'brief_export_requested','brief_export_succeeded','brief_export_failed',
    'media_error','web_vital'
  )),
  event_version smallint NOT NULL DEFAULT 1 CHECK (event_version > 0),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  anonymous_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  route text NOT NULL CHECK (char_length(route) BETWEEN 1 AND 300),
  entity_type text CHECK (entity_type IS NULL OR char_length(entity_type) <= 40),
  entity_id text CHECK (entity_id IS NULL OR char_length(entity_id) <= 160),
  success boolean,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  experiment_id text CHECK (experiment_id IS NULL OR char_length(experiment_id) <= 80),
  experiment_variant text CHECK (experiment_variant IS NULL OR char_length(experiment_variant) <= 80),
  device_class text CHECK (device_class IS NULL OR device_class IN ('mobile','tablet','desktop')),
  reduced_motion boolean NOT NULL DEFAULT false,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(properties) = 'object'),
  CHECK (pg_column_size(properties) <= 8192)
);

CREATE INDEX IF NOT EXISTS product_events_received_idx ON public.product_events (received_at DESC);
CREATE INDEX IF NOT EXISTS product_events_name_received_idx ON public.product_events (event_name, received_at DESC);
CREATE INDEX IF NOT EXISTS product_events_session_received_idx ON public.product_events (session_id, received_at DESC);
CREATE INDEX IF NOT EXISTS product_events_anonymous_received_idx ON public.product_events (anonymous_id, received_at DESC);
CREATE INDEX IF NOT EXISTS product_events_user_received_idx ON public.product_events (user_id, received_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_events TO service_role;

CREATE TABLE IF NOT EXISTS public.workflow_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL UNIQUE,
  action_type text NOT NULL CHECK (action_type IN ('underwrite','brief_export')),
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  anonymous_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  market_id text NOT NULL CHECK (char_length(market_id) BETWEEN 1 AND 160),
  market_name text NOT NULL CHECK (char_length(market_name) BETWEEN 1 AND 200),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(input_snapshot) = 'object'),
  CHECK (pg_column_size(input_snapshot) <= 16384)
);

CREATE INDEX IF NOT EXISTS workflow_actions_created_idx ON public.workflow_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_actions_anonymous_created_idx ON public.workflow_actions (anonymous_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_actions_user_created_idx ON public.workflow_actions (user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.workflow_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.workflow_actions TO service_role;

CREATE OR REPLACE FUNCTION public.record_product_event(
  p_client_event_id uuid, p_event_name text, p_occurred_at timestamptz,
  p_session_id uuid, p_anonymous_id uuid, p_user_id uuid, p_route text,
  p_entity_type text DEFAULT NULL, p_entity_id text DEFAULT NULL,
  p_success boolean DEFAULT NULL, p_duration_ms integer DEFAULT NULL,
  p_experiment_id text DEFAULT NULL, p_experiment_variant text DEFAULT NULL,
  p_device_class text DEFAULT NULL, p_reduced_motion boolean DEFAULT false,
  p_properties jsonb DEFAULT '{}'::jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_occurred_at timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_events WHERE client_event_id = p_client_event_id) THEN RETURN true; END IF;
  IF (SELECT count(*) FROM public.product_events WHERE session_id = p_session_id AND received_at >= now() - interval '1 minute') >= 90 THEN RETURN false; END IF;
  v_occurred_at := CASE WHEN p_occurred_at BETWEEN now() - interval '24 hours' AND now() + interval '5 minutes' THEN p_occurred_at ELSE now() END;
  INSERT INTO public.product_events (
    client_event_id, event_name, occurred_at, session_id, anonymous_id, user_id, route,
    entity_type, entity_id, success, duration_ms, experiment_id, experiment_variant,
    device_class, reduced_motion, properties
  ) VALUES (
    p_client_event_id, p_event_name, v_occurred_at, p_session_id, p_anonymous_id, p_user_id, p_route,
    p_entity_type, p_entity_id, p_success, p_duration_ms, p_experiment_id, p_experiment_variant,
    p_device_class, p_reduced_motion, COALESCE(p_properties, '{}'::jsonb)
  ) ON CONFLICT (client_event_id) DO NOTHING;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.record_product_event(uuid,text,timestamptz,uuid,uuid,uuid,text,text,text,boolean,integer,text,text,text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_event(uuid,text,timestamptz,uuid,uuid,uuid,text,text,text,boolean,integer,text,text,text,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_workflow_action(
  p_client_event_id uuid, p_action_type text, p_occurred_at timestamptz,
  p_session_id uuid, p_anonymous_id uuid, p_user_id uuid, p_route text,
  p_market_id text, p_market_name text, p_device_class text,
  p_reduced_motion boolean, p_record_analytics boolean,
  p_input_snapshot jsonb DEFAULT '{}'::jsonb, p_properties jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action_id uuid; v_event_name text; v_occurred_at timestamptz;
BEGIN
  IF p_action_type NOT IN ('underwrite','brief_export') THEN RAISE EXCEPTION 'Unsupported workflow action'; END IF;
  SELECT id INTO v_action_id FROM public.workflow_actions WHERE client_event_id = p_client_event_id;
  IF v_action_id IS NOT NULL THEN RETURN v_action_id; END IF;
  IF (SELECT count(*) FROM public.workflow_actions WHERE session_id = p_session_id AND created_at >= now() - interval '1 minute') >= 20 THEN RAISE EXCEPTION 'Workflow action rate limit exceeded'; END IF;
  v_occurred_at := CASE WHEN p_occurred_at BETWEEN now() - interval '24 hours' AND now() + interval '5 minutes' THEN p_occurred_at ELSE now() END;
  v_event_name := CASE p_action_type WHEN 'underwrite' THEN 'underwrite_succeeded' ELSE 'brief_export_succeeded' END;
  INSERT INTO public.workflow_actions (client_event_id, action_type, session_id, anonymous_id, user_id, market_id, market_name, input_snapshot)
  VALUES (p_client_event_id, p_action_type, p_session_id, p_anonymous_id, p_user_id, p_market_id, p_market_name, COALESCE(p_input_snapshot, '{}'::jsonb))
  ON CONFLICT (client_event_id) DO UPDATE SET client_event_id = EXCLUDED.client_event_id
  RETURNING id INTO v_action_id;
  IF COALESCE(p_record_analytics, false) THEN
    INSERT INTO public.product_events (
      client_event_id, event_name, occurred_at, session_id, anonymous_id, user_id, route,
      entity_type, entity_id, success, device_class, reduced_motion, properties
    ) VALUES (
      p_client_event_id, v_event_name, v_occurred_at, p_session_id, p_anonymous_id, p_user_id, p_route,
      'market', p_market_id, true, p_device_class, COALESCE(p_reduced_motion, false),
      COALESCE(p_properties, '{}'::jsonb) || jsonb_build_object('action_id', v_action_id)
    ) ON CONFLICT (client_event_id) DO NOTHING;
  END IF;
  RETURN v_action_id;
END; $$;

REVOKE ALL ON FUNCTION public.record_workflow_action(uuid,text,timestamptz,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workflow_action(uuid,text,timestamptz,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,jsonb) TO service_role;
