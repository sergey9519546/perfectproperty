/**
 * Post-ingest underwrite pass.
 *
 * Fixture seeding was removed — this project runs on LIVE ingested data
 * only (county parcels, real NYC sales, and Scrapy-pushed distress). This
 * server fn re-scores every parcel with the current engine + market
 * context and records one ingestion_runs entry per invocation.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/require-admin";
import { MARKET_CONTEXT, underwrite, type ParcelInput, type DistressInput } from "./engine";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const runUnderwrite = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const supabase = await adminClient();
    const { data: parcels, error } = await supabase.from("parcels").select("*");
    if (error) throw new Error(error.message);
    const { data: distress } = await supabase.from("distress_events").select("*");
    const byParcel = new Map<string, DistressInput[]>();
    for (const d of distress ?? []) {
      const arr = byParcel.get(d.parcel_id) ?? [];
      arr.push({
        event_type: d.event_type, severity: d.severity, amount: d.amount,
        event_date: d.event_date, auction_date: d.auction_date,
      });
      byParcel.set(d.parcel_id, arr);
    }

    const scores: any[] = [];
    let skipped = 0;
    for (const p of parcels ?? []) {
      const m = MARKET_CONTEXT[p.county_fips];
      if (!m) { skipped++; continue; }
      const input: ParcelInput = {
        living_sqft: p.living_sqft, lot_sqft: p.lot_sqft, year_built: p.year_built,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms ? Number(p.bathrooms) : null,
        condition_grade: p.condition_grade, flood_zone: p.flood_zone, school_score: p.school_score,
        assessed_value: p.assessed_value ? Number(p.assessed_value) : null,
        estimated_equity: p.estimated_equity ? Number(p.estimated_equity) : null,
        owner_is_absentee: p.owner_is_absentee, owner_since: p.owner_since,
        is_listed: p.is_listed, is_vacant: p.is_vacant, state: p.state,
      };
      const u = underwrite(input, byParcel.get(p.id) ?? [], m);
      scores.push({
        parcel_id: p.id,
        as_is_value: u.as_is_value, cosmetic_arv: u.cosmetic_arv,
        full_reno_arv: u.full_reno_arv, expanded_arv: u.expanded_arv,
        recommended_scope: u.recommended_scope, reno_cost: u.reno_cost,
        carry_cost: u.carry_cost, selling_cost: u.selling_cost,
        modeled_offer: u.modeled_offer, acquisition_probability: u.acquisition_probability,
        exit_days: u.exit_days, exit_confidence: u.exit_confidence,
        gross_profit: u.gross_profit, risk_adjusted_profit: u.risk_adjusted_profit,
        perfect_score: u.perfect_score, confidence_grade: u.confidence_grade,
        skeptic_flags: u.skeptic_flags, ring: u.ring,
        computed_at: new Date().toISOString(),
        data_source: (p as any).data_source ?? "LIVE",
        mc_profit_p5: (u as any).mc_profit_p5 ?? null,
        mc_profit_p50: (u as any).mc_profit_p50 ?? null,
        mc_profit_p95: (u as any).mc_profit_p95 ?? null,
        mc_p_loss: (u as any).mc_p_loss ?? null,
        mc_cvar_loss: (u as any).mc_cvar_loss ?? null,
        mc_dqr: (u as any).mc_dqr ?? null,
        governor_kappa: (u as any).governor_kappa ?? null,
        exceedance_rank: (u as any).exceedance_rank ?? null,
        sigma_arv_log: (u as any).sigma_arv_log ?? null,
        drift_used_monthly: (u as any).drift_used_monthly ?? null,
        arv_today: u.arv_today ?? null,
        arv_exit_p5: u.arv_exit_p5 ?? null,
        arv_exit_p50: u.arv_exit_p50 ?? null,
        arv_exit_p95: u.arv_exit_p95 ?? null,
        lightgbm_divergence: u.lightgbm_divergence ?? null,
        primary_rank: u.primary_rank ?? null,
        retail_score: u.retail_score ?? null,
        survival_factor: u.survival_factor ?? null,
        pd_credit: u.pd_credit ?? null,
        pd_project: u.pd_project ?? null,
        pd_exit: u.pd_exit ?? null,
        ead: u.ead ?? null,
        lgd: u.lgd ?? null,
        expected_loss: u.expected_loss ?? null,
        risk_adjusted_profit_credit: u.risk_adjusted_profit_credit ?? null,
        raroc: u.raroc ?? null,
        gate_status: u.gate_status ?? null,
      });
    }

    // Replace all scores atomically per-batch.
    await supabase.from("parcel_scores").delete().gte("computed_at", "1900-01-01");
    const CHUNK = 200;
    for (let i = 0; i < scores.length; i += CHUNK) {
      await supabase.from("parcel_scores").insert(scores.slice(i, i + CHUNK));
    }

    await supabase.from("ingestion_runs").insert({
      county_fips: (parcels?.[0] as any)?.county_fips ?? "MULTI",
      source: "UNDERWRITE", status: "OK",
      rows_ingested: scores.length,
      notes: `Underwrote ${scores.length} live parcels${skipped ? ` · skipped ${skipped} (no market context)` : ""}`,
      finished_at: new Date().toISOString(),
    });

    return { scored: scores.length, skipped, outcomes: 0 };
  });
