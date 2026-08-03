UPDATE public.enrichment_queue
SET status = 'pending', attempts = 0, last_error = 'provider account inactive (403)', started_at = NULL, completed_at = NULL
WHERE last_error ILIKE '%403%' OR last_error ILIKE '%payment method%' OR last_error ILIKE '%usage limit%';