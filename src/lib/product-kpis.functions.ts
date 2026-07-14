import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/require-admin";

export type ProductKpiDaily = {
  metric_date: string;
  landing_sessions: number;
  workspace_sessions: number;
  evidence_sessions: number;
  action_sessions: number;
  evidence_action_sessions: number;
  qualified_activations: number;
  story_exposed_sessions: number;
  story_qualified_activations: number;
  unexposed_qualified_activations: number;
  qualified_activation_rate: number | null;
  landing_to_workspace_rate: number | null;
  evidence_to_action_rate: number | null;
  median_seconds_to_action: number | null;
};

export type ProductExperienceDaily = {
  metric_date: string;
  p75_lcp_ms: number | null;
  p75_interaction_latency_ms: number | null;
  average_cls: number | null;
  media_errors: number;
  media_error_sessions: number;
};

export type ProductQualityGuardrail = {
  computed_at: string;
  scope: string;
  n_deals: number;
  calibration_slope: number | null;
  calibration_flag: boolean | null;
  psi: number | null;
  psi_band: string | null;
  risk_appetite_breached: boolean;
};

export const getProductKpis = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [kpis, experience, quality] = await Promise.all([
      admin
        .from("product_kpi_daily")
        .select("*")
        .gte("metric_date", since)
        .order("metric_date", { ascending: false }),
      admin
        .from("product_experience_daily")
        .select("*")
        .gte("metric_date", since)
        .order("metric_date", { ascending: false }),
      admin
        .from("portfolio_metrics")
        .select("computed_at,scope,n_deals,calibration_slope,calibration_flag,psi,psi_band,risk_appetite_breached")
        .order("computed_at", { ascending: false })
        .limit(1),
    ]);

    const error = kpis.error ?? experience.error ?? quality.error;
    if (error) throw new Error(error.message);

    return {
      kpis: (kpis.data ?? []) as ProductKpiDaily[],
      experience: (experience.data ?? []) as ProductExperienceDaily[],
      quality: ((quality.data ?? [])[0] ?? null) as ProductQualityGuardrail | null,
    };
  });
