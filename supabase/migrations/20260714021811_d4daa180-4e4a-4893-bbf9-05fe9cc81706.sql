
DROP POLICY IF EXISTS public_read_field_provenance ON public.field_provenance;
CREATE POLICY authenticated_read_field_provenance ON public.field_provenance FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.field_provenance FROM anon;

DROP POLICY IF EXISTS portfolio_metrics_public_read ON public.portfolio_metrics;
REVOKE SELECT ON public.portfolio_metrics FROM anon;

DROP POLICY IF EXISTS public_read_scrape_targets ON public.scrape_targets;
CREATE POLICY authenticated_read_scrape_targets ON public.scrape_targets FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.scrape_targets FROM anon;
