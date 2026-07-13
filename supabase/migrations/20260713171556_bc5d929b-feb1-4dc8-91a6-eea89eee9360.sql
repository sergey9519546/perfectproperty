CREATE POLICY "portfolio_metrics_public_read"
  ON public.portfolio_metrics FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.portfolio_metrics TO anon;