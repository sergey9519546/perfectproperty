
-- Trigger helpers: only ever called from AFTER INSERT triggers; no direct callers.
REVOKE EXECUTE ON FUNCTION public.enqueue_enrichment_for_parcel(uuid, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_from_distress() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_from_listing() FROM PUBLIC, anon, authenticated;

-- Public read helper: switch to SECURITY INVOKER so RLS on distress_events/listings applies.
CREATE OR REPLACE FUNCTION public.parcels_with_active_trigger(_days int DEFAULT 180)
RETURNS TABLE(parcel_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT parcel_id FROM public.distress_events
    WHERE parcel_id IS NOT NULL
      AND event_date >= (CURRENT_DATE - (_days || ' days')::interval)
  UNION
  SELECT DISTINCT parcel_id FROM public.listings
    WHERE parcel_id IS NOT NULL
      AND listed_at >= (CURRENT_DATE - (_days || ' days')::interval)
$$;

REVOKE EXECUTE ON FUNCTION public.parcels_with_active_trigger(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcels_with_active_trigger(int) TO authenticated, service_role;
