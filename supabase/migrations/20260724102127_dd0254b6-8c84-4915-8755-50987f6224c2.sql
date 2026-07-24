
ALTER TABLE public.enrichment_queue DROP CONSTRAINT IF EXISTS enrichment_queue_status_chk;
ALTER TABLE public.enrichment_queue ADD CONSTRAINT enrichment_queue_status_chk
  CHECK (status IN ('pending','inflight','in_progress','done','failed','skipped'));

UPDATE public.enrichment_queue eq
SET status = 'skipped',
    last_error = 'unusable address (placeholder/empty)',
    completed_at = now(),
    started_at = NULL
FROM public.parcels p
WHERE eq.parcel_id = p.id
  AND eq.status IN ('pending','inflight','in_progress','failed')
  AND (
    p.address IS NULL
    OR length(btrim(p.address)) < 5
    OR p.address ~* '^address\s+unknown'
    OR p.address ~* '^(n|na|n/a|unknown|null|none|-+)$'
    OR p.address !~ '[0-9]'
  );

UPDATE public.enrichment_queue
SET status = 'pending', started_at = NULL
WHERE status IN ('inflight','in_progress')
  AND (started_at IS NULL OR started_at < now() - interval '1 hour');
