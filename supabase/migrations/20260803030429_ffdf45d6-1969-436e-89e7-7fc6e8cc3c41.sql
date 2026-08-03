CREATE TABLE IF NOT EXISTS public.realie_usage_daily (
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  property_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_date, endpoint)
);
GRANT SELECT ON public.realie_usage_daily TO authenticated;
GRANT ALL ON public.realie_usage_daily TO service_role;
ALTER TABLE public.realie_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_realie_usage" ON public.realie_usage_daily
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service_all_realie_usage" ON public.realie_usage_daily
  TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.orchestrator_config
  ADD COLUMN IF NOT EXISTS realie_daily_call_limit integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS realie_background_call_limit integer NOT NULL DEFAULT 400;

CREATE OR REPLACE FUNCTION public.reserve_realie_call(p_endpoint text, p_budget_class text DEFAULT 'background')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_limit integer;
  v_bg_limit integer;
BEGIN
  SELECT COALESCE(realie_daily_call_limit, 500), COALESCE(realie_background_call_limit, 400)
    INTO v_limit, v_bg_limit
  FROM public.orchestrator_config WHERE id = 1;
  v_limit := COALESCE(v_limit, 500);
  v_bg_limit := COALESCE(v_bg_limit, 400);

  SELECT COALESCE(SUM(request_count), 0) INTO v_total
  FROM public.realie_usage_daily WHERE usage_date = CURRENT_DATE;

  IF v_total >= v_limit THEN RETURN false; END IF;
  IF p_budget_class = 'background' AND v_total >= v_bg_limit THEN RETURN false; END IF;

  INSERT INTO public.realie_usage_daily (usage_date, endpoint, request_count)
  VALUES (CURRENT_DATE, p_endpoint, 1)
  ON CONFLICT (usage_date, endpoint) DO UPDATE
    SET request_count = public.realie_usage_daily.request_count + 1,
        updated_at = now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.record_realie_call_result(p_endpoint text, p_success boolean, p_property_count integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.realie_usage_daily (
    usage_date, endpoint, request_count, success_count, failure_count, property_count
  ) VALUES (
    CURRENT_DATE, p_endpoint, 0,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    GREATEST(COALESCE(p_property_count, 0), 0)
  )
  ON CONFLICT (usage_date, endpoint) DO UPDATE SET
    success_count = public.realie_usage_daily.success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
    failure_count = public.realie_usage_daily.failure_count + CASE WHEN p_success THEN 0 ELSE 1 END,
    property_count = public.realie_usage_daily.property_count + GREATEST(COALESCE(p_property_count, 0), 0),
    updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.reserve_realie_call(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_realie_call_result(text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_realie_call(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_realie_call_result(text, boolean, integer) TO service_role;

UPDATE public.enrichment_queue
SET status = 'pending', attempts = GREATEST(attempts - 1, 0), last_error = NULL, started_at = NULL, completed_at = NULL
WHERE last_error LIKE '%reserve_realie_call%';