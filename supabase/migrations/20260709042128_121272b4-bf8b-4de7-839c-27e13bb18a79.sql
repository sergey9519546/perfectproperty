-- Portfolio-level monitoring snapshots produced by the nightly monitoring cron.
CREATE TABLE public.portfolio_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope TEXT NOT NULL DEFAULT 'LIVE',
  n_deals INT NOT NULL DEFAULT 0,
  el NUMERIC,
  var_95 NUMERIC,
  cvar_95 NUMERIC,
  ec NUMERIC,
  raroc NUMERIC,
  hhi_county NUMERIC,
  hhi_scope NUMERIC,
  lcr NUMERIC,
  psi NUMERIC,
  psi_band TEXT,
  calibration_slope NUMERIC,
  calibration_intercept NUMERIC,
  calibration_flag BOOLEAN,
  risk_appetite_breached BOOLEAN NOT NULL DEFAULT false,
  breach_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.portfolio_metrics TO anon;
GRANT SELECT ON public.portfolio_metrics TO authenticated;
GRANT ALL ON public.portfolio_metrics TO service_role;

ALTER TABLE public.portfolio_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio metrics are public read"
  ON public.portfolio_metrics FOR SELECT
  USING (true);

CREATE INDEX idx_portfolio_metrics_computed_at ON public.portfolio_metrics (computed_at DESC);