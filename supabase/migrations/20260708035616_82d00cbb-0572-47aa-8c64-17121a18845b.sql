
ALTER TABLE public.parcel_scores
  ADD COLUMN IF NOT EXISTS arv_today NUMERIC,
  ADD COLUMN IF NOT EXISTS arv_exit_p5 NUMERIC,
  ADD COLUMN IF NOT EXISTS arv_exit_p50 NUMERIC,
  ADD COLUMN IF NOT EXISTS arv_exit_p95 NUMERIC,
  ADD COLUMN IF NOT EXISTS lightgbm_divergence NUMERIC,
  ADD COLUMN IF NOT EXISTS primary_rank NUMERIC,
  ADD COLUMN IF NOT EXISTS retail_score NUMERIC,
  ADD COLUMN IF NOT EXISTS survival_factor NUMERIC,
  ADD COLUMN IF NOT EXISTS pd_credit NUMERIC,
  ADD COLUMN IF NOT EXISTS pd_project NUMERIC,
  ADD COLUMN IF NOT EXISTS pd_exit NUMERIC,
  ADD COLUMN IF NOT EXISTS ead NUMERIC,
  ADD COLUMN IF NOT EXISTS lgd NUMERIC,
  ADD COLUMN IF NOT EXISTS expected_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS risk_adjusted_profit_credit NUMERIC,
  ADD COLUMN IF NOT EXISTS raroc NUMERIC,
  ADD COLUMN IF NOT EXISTS gate_status JSONB;

CREATE INDEX IF NOT EXISTS scores_retail_idx ON public.parcel_scores(retail_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS scores_primary_rank_idx ON public.parcel_scores(primary_rank DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.decision_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGSERIAL,
  decision_id TEXT NOT NULL,
  parcel_id UUID REFERENCES public.parcels(id) ON DELETE SET NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  input_snapshot JSONB NOT NULL,
  output_snapshot JSONB NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_id UUID,
  compliance_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS decision_audit_parcel_idx ON public.decision_audit(parcel_id, ts DESC);
CREATE INDEX IF NOT EXISTS decision_audit_seq_idx ON public.decision_audit(seq);

GRANT SELECT ON public.decision_audit TO authenticated;
GRANT ALL ON public.decision_audit TO service_role;
ALTER TABLE public.decision_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decision_audit_read" ON public.decision_audit
  FOR SELECT TO authenticated USING (true);
