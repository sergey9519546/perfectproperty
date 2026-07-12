CREATE OR REPLACE FUNCTION public.record_underwrite_atomic(
  p_score jsonb,
  p_audit jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_parcel_id uuid := (p_score->>'parcel_id')::uuid;
BEGIN
  IF v_parcel_id IS NULL THEN
    RAISE EXCEPTION 'record_underwrite_atomic: p_score.parcel_id is required';
  END IF;

  DELETE FROM public.parcel_scores WHERE parcel_id = v_parcel_id;
  INSERT INTO public.parcel_scores
    SELECT * FROM jsonb_populate_record(NULL::public.parcel_scores, p_score);

  INSERT INTO public.decision_audit
    SELECT * FROM jsonb_populate_record(NULL::public.decision_audit, p_audit);
END;
$$;

REVOKE ALL ON FUNCTION public.record_underwrite_atomic(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_underwrite_atomic(jsonb, jsonb) TO service_role;