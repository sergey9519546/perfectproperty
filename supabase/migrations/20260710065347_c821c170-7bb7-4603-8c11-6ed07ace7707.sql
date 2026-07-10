
DROP POLICY IF EXISTS "authenticated can insert jobs" ON public.bulk_lookup_jobs;
DROP POLICY IF EXISTS "authenticated can insert items" ON public.bulk_lookup_items;
CREATE POLICY "authenticated can insert jobs" ON public.bulk_lookup_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated can insert items" ON public.bulk_lookup_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
