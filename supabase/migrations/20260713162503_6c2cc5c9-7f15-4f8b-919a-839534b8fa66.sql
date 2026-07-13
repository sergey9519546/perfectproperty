
-- 1. enrichment_queue table
CREATE TABLE public.enrichment_queue (
  parcel_id uuid PRIMARY KEY REFERENCES public.parcels(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 100,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT enrichment_queue_status_chk CHECK (status IN ('pending','inflight','done','failed')),
  CONSTRAINT enrichment_queue_reason_chk CHECK (reason IN ('foreclosure','probate','code_violation','tax_lien','listing','manual'))
);

CREATE INDEX enrichment_queue_status_priority_idx
  ON public.enrichment_queue (status, priority DESC, requested_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_queue TO authenticated;
GRANT ALL ON public.enrichment_queue TO service_role;

ALTER TABLE public.enrichment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage enrichment queue"
  ON public.enrichment_queue
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Auto-enqueue trigger
CREATE OR REPLACE FUNCTION public.enqueue_enrichment_for_parcel(
  _parcel_id uuid,
  _reason text,
  _priority int DEFAULT 100
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _needs boolean;
BEGIN
  IF _parcel_id IS NULL THEN RETURN; END IF;

  SELECT (living_sqft IS NULL OR year_built IS NULL)
    INTO _needs
  FROM public.parcels
  WHERE id = _parcel_id;

  IF NOT COALESCE(_needs, false) THEN RETURN; END IF;

  INSERT INTO public.enrichment_queue(parcel_id, reason, priority, status, requested_at)
  VALUES (_parcel_id, _reason, _priority, 'pending', now())
  ON CONFLICT (parcel_id) DO UPDATE
    SET priority = GREATEST(public.enrichment_queue.priority, EXCLUDED.priority),
        reason = CASE WHEN public.enrichment_queue.status IN ('done','failed')
                      THEN EXCLUDED.reason ELSE public.enrichment_queue.reason END,
        status = CASE WHEN public.enrichment_queue.status IN ('done','failed')
                      THEN 'pending' ELSE public.enrichment_queue.status END,
        requested_at = CASE WHEN public.enrichment_queue.status IN ('done','failed')
                            THEN now() ELSE public.enrichment_queue.requested_at END;
END $$;

CREATE OR REPLACE FUNCTION public.tg_enqueue_from_distress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_enrichment_for_parcel(
    NEW.parcel_id,
    LOWER(COALESCE(NEW.event_type, 'foreclosure')),
    CASE LOWER(COALESCE(NEW.event_type, ''))
      WHEN 'foreclosure' THEN 300
      WHEN 'probate' THEN 250
      WHEN 'code_violation' THEN 200
      WHEN 'tax_lien' THEN 220
      ELSE 150
    END
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_enqueue_from_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_enrichment_for_parcel(NEW.parcel_id, 'listing', 180);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS distress_events_enqueue ON public.distress_events;
CREATE TRIGGER distress_events_enqueue
  AFTER INSERT ON public.distress_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_from_distress();

DROP TRIGGER IF EXISTS listings_enqueue ON public.listings;
CREATE TRIGGER listings_enqueue
  AFTER INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_from_listing();

-- 3. Helper: parcels with an active deal trigger in last 180 days
CREATE OR REPLACE FUNCTION public.parcels_with_active_trigger(_days int DEFAULT 180)
RETURNS TABLE(parcel_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT parcel_id FROM public.distress_events
    WHERE parcel_id IS NOT NULL
      AND event_date >= (CURRENT_DATE - (_days || ' days')::interval)
  UNION
  SELECT DISTINCT parcel_id FROM public.listings
    WHERE parcel_id IS NOT NULL
      AND listed_at >= (CURRENT_DATE - (_days || ' days')::interval)
$$;

GRANT EXECUTE ON FUNCTION public.parcels_with_active_trigger(int) TO authenticated, service_role;
