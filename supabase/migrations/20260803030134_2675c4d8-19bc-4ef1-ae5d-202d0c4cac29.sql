CREATE OR REPLACE FUNCTION public.claim_enrichment_queue(p_limit integer DEFAULT 25)
RETURNS TABLE(parcel_id uuid, reason text, priority integer, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.parcel_id
    FROM public.enrichment_queue q
    WHERE q.status = 'pending'
    ORDER BY q.priority DESC, q.requested_at
    LIMIT GREATEST(1, LEAST(100, COALESCE(p_limit, 25)))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.enrichment_queue e
  SET status = 'inflight', started_at = now()
  FROM picked
  WHERE e.parcel_id = picked.parcel_id
  RETURNING e.parcel_id, e.reason, e.priority, e.attempts;
END $$;

REVOKE ALL ON FUNCTION public.claim_enrichment_queue(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_enrichment_queue(integer) TO service_role;