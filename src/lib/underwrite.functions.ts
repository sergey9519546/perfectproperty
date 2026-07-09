/**
 * Per-deal underwrite server function.
 *
 * Runs the full v12 + credit pipeline for a single parcel, upserts the
 * result into `parcel_scores`, and appends a hash-chained row to
 * `decision_audit` so we can prove exactly what the machine decided and
 * with which inputs.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { underwrite, MARKET_CONTEXT, type ParcelInput, type DistressInput } from "@/lib/engine";
import { appendDecision, type DecisionRecord } from "@/lib/engine/warehouse";

function serverClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const Input = z.object({ parcel_id: z.string().uuid() });

export const rerunUnderwrite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const supabase = serverClient();

    const { data: parcel, error: pErr } = await supabase
      .from("parcels").select("*").eq("id", data.parcel_id).single();
    if (pErr || !parcel) throw new Error(pErr?.message ?? "parcel not found");

    const [{ data: distressRows }, { data: comps }] = await Promise.all([
      supabase.from("distress_events").select("*").eq("parcel_id", data.parcel_id),
      parcel.lat != null && parcel.lng != null && (parcel.living_sqft ?? 0) > 100
        ? (supabase as any).rpc("pick_comps", {
            subject_lat: parcel.lat,
            subject_lng: parcel.lng,
            subject_sqft: parcel.living_sqft,
            subject_county: parcel.county_fips,
          })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const input: ParcelInput = {
      living_sqft: parcel.living_sqft, lot_sqft: parcel.lot_sqft, year_built: parcel.year_built,
      bedrooms: parcel.bedrooms, bathrooms: parcel.bathrooms ? Number(parcel.bathrooms) : null,
      condition_grade: parcel.condition_grade, flood_zone: parcel.flood_zone,
      school_score: parcel.school_score, assessed_value: parcel.assessed_value ? Number(parcel.assessed_value) : null,
      estimated_equity: parcel.estimated_equity ? Number(parcel.estimated_equity) : null,
      owner_is_absentee: parcel.owner_is_absentee, owner_since: parcel.owner_since,
      is_listed: parcel.is_listed, is_vacant: parcel.is_vacant, state: parcel.state,
    };
    const distress: DistressInput[] = (distressRows ?? []).map((d: any) => ({
      event_type: d.event_type, severity: d.severity, amount: d.amount,
      event_date: d.event_date, auction_date: d.auction_date,
    }));
    const m = MARKET_CONTEXT[parcel.county_fips] ?? {
      median_ppsf: 300, ppsf_stddev: 90, avg_dom_renovated: 55, pending_ratio: 0.35, momentum: 0,
    };
    const compsClean = (comps ?? []).map((c: any) => ({
      ppsf: Number(c.ppsf), distance_km: Number(c.distance_km),
      sale_id: c.sale_id, address: c.address, sold_at: c.sold_at,
      sale_price: Number(c.sale_price), living_sqft: c.living_sqft,
    }));

    const u = underwrite(input, distress, m, compsClean) as any;

    const row = {
      parcel_id: parcel.id,
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
      data_source: "LIVE",
      comps_used: compsClean, comp_count: u.comp_count, arv_source: u.arv_source,
      mc_profit_p5: u.mc_profit_p5 ?? null, mc_profit_p50: u.mc_profit_p50 ?? null,
      mc_profit_p95: u.mc_profit_p95 ?? null, mc_p_loss: u.mc_p_loss ?? null,
      mc_cvar_loss: u.mc_cvar_loss ?? null, mc_dqr: u.mc_dqr ?? null,
      governor_kappa: u.governor_kappa ?? null, exceedance_rank: u.exceedance_rank ?? null,
      sigma_arv_log: u.sigma_arv_log ?? null, drift_used_monthly: u.drift_used_monthly ?? null,
      arv_today: u.arv_today, arv_exit_p5: u.arv_exit_p5,
      arv_exit_p50: u.arv_exit_p50, arv_exit_p95: u.arv_exit_p95,
      lightgbm_divergence: u.lightgbm_divergence, primary_rank: u.primary_rank,
      retail_score: u.retail_score, survival_factor: u.survival_factor,
      pd_credit: u.pd_credit, pd_project: u.pd_project, pd_exit: u.pd_exit,
      ead: u.ead, lgd: u.lgd, expected_loss: u.expected_loss,
      risk_adjusted_profit_credit: u.risk_adjusted_profit_credit, raroc: u.raroc,
      gate_status: u.gate_status,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("parcel_scores").upsert(row, { onConflict: "parcel_id" });

    // Append a decision_audit row (hash-chained).
    const { data: last } = await supabaseAdmin
      .from("decision_audit").select("hash").eq("parcel_id", parcel.id)
      .order("seq", { ascending: false }).limit(1).maybeSingle();
    const prev_hash = last?.hash ?? "GENESIS";
    const rec: DecisionRecord = {
      decision_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      model_version: "v12.0",
      policy_version: "policy.0",
      feature_hashes: [],
      input_snapshot: { input, distress, market: m, comps_n: compsClean.length },
      output_snapshot: {
        perfect_score: u.perfect_score, gross_profit: u.gross_profit,
        risk_adjusted_profit_credit: u.risk_adjusted_profit_credit,
        pd_credit: u.pd_credit, lgd: u.lgd, ead: u.ead, raroc: u.raroc,
        gate_status: u.gate_status,
      },
      reason_codes: u.skeptic_flags ?? [],
      user_id: "system",
      compliance_flags: [],
    };
    const chained = await appendDecision(prev_hash, rec);
    await supabaseAdmin.from("decision_audit").insert({
      parcel_id: parcel.id,
      decision_id: chained.decision_id,
      ts: chained.timestamp,
      model_version: chained.model_version,
      policy_version: chained.policy_version,
      input_snapshot: chained.input_snapshot as any,
      output_snapshot: chained.output_snapshot as any,
      reason_codes: chained.reason_codes as any,
      compliance_flags: chained.compliance_flags as any,
      previous_hash: chained.previous_hash,
      hash: chained.hash,
    });

    return { ok: true, perfect_score: u.perfect_score };
  });
