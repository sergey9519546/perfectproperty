UPDATE public.enrichment_queue
SET status = 'pending', attempts = GREATEST(attempts - 1, 0), last_error = NULL, started_at = NULL, completed_at = NULL
WHERE last_error LIKE '%realie_property_snapshots%';