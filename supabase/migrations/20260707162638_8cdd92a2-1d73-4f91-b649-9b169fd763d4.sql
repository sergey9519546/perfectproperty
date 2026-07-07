ALTER TABLE public.parcel_scores
  ADD COLUMN IF NOT EXISTS mc_profit_p5 numeric,
  ADD COLUMN IF NOT EXISTS mc_profit_p50 numeric,
  ADD COLUMN IF NOT EXISTS mc_profit_p95 numeric,
  ADD COLUMN IF NOT EXISTS mc_p_loss numeric,
  ADD COLUMN IF NOT EXISTS mc_cvar_loss numeric,
  ADD COLUMN IF NOT EXISTS mc_dqr numeric,
  ADD COLUMN IF NOT EXISTS governor_kappa numeric,
  ADD COLUMN IF NOT EXISTS exceedance_rank numeric,
  ADD COLUMN IF NOT EXISTS sigma_arv_log numeric,
  ADD COLUMN IF NOT EXISTS drift_used_monthly numeric;

CREATE INDEX IF NOT EXISTS parcel_scores_mc_p_loss_idx ON public.parcel_scores (mc_p_loss);
CREATE INDEX IF NOT EXISTS parcel_scores_exceedance_rank_idx ON public.parcel_scores (exceedance_rank DESC NULLS LAST);