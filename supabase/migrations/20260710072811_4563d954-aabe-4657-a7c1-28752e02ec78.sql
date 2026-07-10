-- Remove pre-existing duplicates (keep the earliest row per job/address/state)
DELETE FROM public.bulk_lookup_items a
USING public.bulk_lookup_items b
WHERE a.job_id = b.job_id
  AND upper(a.address) = upper(b.address)
  AND upper(a.state) = upper(b.state)
  AND a.created_at > b.created_at;

-- Unique constraint (case-insensitive via functional index)
CREATE UNIQUE INDEX IF NOT EXISTS bulk_lookup_items_job_addr_state_uniq
  ON public.bulk_lookup_items (job_id, upper(address), upper(state));
