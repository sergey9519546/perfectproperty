/**
 * Plain underwrite core, shared by the `rerunUnderwrite` server function and
 * background workers (e.g. bulk lookup, backfill cron). Same logic — just no
 * createServerFn wrapper so it can be awaited outside an HTTP handler.
 */
import {
  underwrite,
  marketContextForCounty,
  type ParcelInput,
  type DistressInput,
} from "@/lib/engine";
import { appendDecision, type DecisionRecord } from "@/lib/engine/warehouse";

export async function rerunUnderwriteCore(parcel_id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin;

  const { data: parcel, error: pErr } = await supabase
    .from("parcels")
    .select("*")
    .eq("id", parcel_id)
    .single();
  if (pErr || !parcel) throw new Error(pErr?.message ?? "parcel not found");

  const [{ data: distressRows }, { data: comps }] = await Promise.all([
    supabase.from("distress_events").select("*").eq("parcel_id", parcel_id),
    parcel.lat != null && parcel.lng != null && (parcel.living_sqft ?? 0) > 100
      ? (supabase as any).rpc("pick_comps", {
          subject_lat: parcel.lat,
          subject_lng: parcel.lng,
          subject_sqft: parcel.living_sqft,
          subject_county: parcel.county_fips,
        })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  let realieCompsRaw: any[] = [];
  const { shouldTopUpWithRealie } = await import("@/lib/arv-picker");
  if (
    shouldTopUpWithRealie({
      localCompCount: (comps as any[])?.length ?? 0,
      hasLatLng: parcel.lat != null && parcel.lng != null,
      hasApiKey: Boolean(process.env.REALIE_API_KEY),
    })
  ) {
    try {
      const { realieComparables, realieCompsToEngineComps } = await import("@/lib/adapters/realie");
      const raw = await realieComparables({
        latitude: Number(parcel.lat),
        longitude: Number(parcel.lng),
        radius: 1,
        timeFrame: 18,
        maxResults: 12,
        sqftMin: parcel.living_sqft ? Math.round(parcel.living_sqft * 0.7) : undefined,
        sqftMax: parcel.living_sqft ? Math.round(parcel.living_sqft * 1.3) : undefined,
        bedsMin: parcel.bedrooms ? Math.max(1, parcel.bedrooms - 1) : undefined,
        bedsMax: parcel.bedrooms ? parcel.bedrooms + 1 : undefined,
      });
      realieCompsRaw = realieCompsToEngineComps(raw, Number(parcel.lat), Number(parcel.lng));
    } catch (e) {
      console.warn("Realie comps fallback failed:", (e as Error).message);
    }
  }

  const input: ParcelInput = {
    living_sqft: parcel.living_sqft,
    lot_sqft: parcel.lot_sqft,
    year_built: parcel.year_built,
    bedrooms: parcel.bedrooms,
    bathrooms: parcel.bathrooms ? Number(parcel.bathrooms) : null,
    condition_grade: parcel.condition_grade,
    flood_zone: parcel.flood_zone,
    school_score: parcel.school_score,
    assessed_value: parcel.assessed_value ? Number(parcel.assessed_value) : null,
    estimated_equity: parcel.estimated_equity ? Number(parcel.estimated_equity) : null,
    owner_is_absentee: parcel.owner_is_absentee,
    owner_since: parcel.owner_since,
    is_listed: parcel.is_listed,
    is_vacant: parcel.is_vacant,
    state: parcel.state,
  };
  const distress: DistressInput[] = ((distressRows as any[]) ?? []).map((d: any) => ({
    event_type: d.event_type,
    severity: d.severity,
    amount: d.amount,
    event_date: d.event_date,
    auction_date: d.auction_date,
  }));
  const m = marketContextForCounty(parcel.county_fips);
  const localComps = ((comps as any[]) ?? []).map((c: any) => ({
    ppsf: Number(c.ppsf),
    distance_km: Number(c.distance_km),
    sale_id: c.sale_id,
    address: c.address,
    sold_at: c.sold_at,
    sale_price: Number(c.sale_price),
    living_sqft: c.living_sqft,
  }));
  const compsClean = [...localComps, ...realieCompsRaw];

  const u = underwrite(input, distress, m, compsClean) as any;

  const row = {
    parcel_id: parcel.id,
    as_is_value: u.as_is_value,
    cosmetic_arv: u.cosmetic_arv,
    full_reno_arv: u.full_reno_arv,
    expanded_arv: u.expanded_arv,
    recommended_scope: u.recommended_scope,
    reno_cost: u.reno_cost,
    carry_cost: u.carry_cost,
    selling_cost: u.selling_cost,
    modeled_offer: u.modeled_offer,
    acquisition_probability: u.acquisition_probability,
    exit_days: u.exit_days,
    exit_confidence: u.exit_confidence,
    gross_profit: u.gross_profit,
    risk_adjusted_profit: u.risk_adjusted_profit,
    perfect_score: u.perfect_score,
    confidence_grade: u.confidence_grade,
    skeptic_flags: u.skeptic_flags,
    ring: u.ring,
    computed_at: new Date().toISOString(),
    data_source: "LIVE",
    comps_used: compsClean,
    comp_count: u.comp_count,
    arv_source: u.arv_source,
    mc_profit_p5: u.mc_profit_p5 ?? null,
    mc_profit_p50: u.mc_profit_p50 ?? null,
    mc_profit_p95: u.mc_profit_p95 ?? null,
    mc_p_loss: u.mc_p_loss ?? null,
    mc_cvar_loss: u.mc_cvar_loss ?? null,
    mc_dqr: u.mc_dqr ?? null,
    governor_kappa: u.governor_kappa ?? null,
    exceedance_rank: u.exceedance_rank ?? null,
    sigma_arv_log: u.sigma_arv_log ?? null,
    drift_used_monthly: u.drift_used_monthly ?? null,
    arv_today: u.arv_today,
    arv_exit_p5: u.arv_exit_p5,
    arv_exit_p50: u.arv_exit_p50,
    arv_exit_p95: u.arv_exit_p95,
    lightgbm_divergence: u.lightgbm_divergence,
    primary_rank: u.primary_rank,
    retail_score: u.retail_score,
    survival_factor: u.survival_factor,
    pd_credit: u.pd_credit,
    pd_project: u.pd_project,
    pd_exit: u.pd_exit,
    ead: u.ead,
    lgd: u.lgd,
    expected_loss: u.expected_loss,
    risk_adjusted_profit_credit: u.risk_adjusted_profit_credit,
    raroc: u.raroc,
    gate_status: u.gate_status,
    score_confidence: null as number | null,
    inputs_provenance: null as any,
  };

  // Attach per-field provenance snapshot + weighted score confidence.
  try {
    const { readLatestProvenance, computeScoreConfidence, buildProvenanceSnapshot } =
      await import("@/lib/provenance.server");
    const { latest } = await readLatestProvenance(parcel.id);
    row.score_confidence = computeScoreConfidence(latest as any);
    row.inputs_provenance = buildProvenanceSnapshot(latest);
  } catch (e) {
    console.warn("score confidence stamp failed:", (e as Error).message);
  }

  const { recordFailure } = await import("@/lib/dlq");

  // Build audit record so we can commit both writes atomically via RPC.
  let auditPayload: any = null;
  try {
    const { data: last } = await supabaseAdmin
      .from("decision_audit")
      .select("hash")
      .eq("parcel_id", parcel.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prev_hash = last?.hash ?? "GENESIS";
    const rec: DecisionRecord = {
      decision_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      model_version: "v12.0",
      policy_version: "policy.0",
      feature_hashes: [],
      input_snapshot: { input, distress, market: m, comps_n: compsClean.length },
      output_snapshot: {
        perfect_score: u.perfect_score,
        gross_profit: u.gross_profit,
        risk_adjusted_profit_credit: u.risk_adjusted_profit_credit,
        pd_credit: u.pd_credit,
        lgd: u.lgd,
        ead: u.ead,
        raroc: u.raroc,
        gate_status: u.gate_status,
      },
      reason_codes: u.skeptic_flags ?? [],
      user_id: "system",
      compliance_flags: [],
    };
    const chained = await appendDecision(prev_hash, rec);
    auditPayload = {
      parcel_id: parcel.id,
      decision_id: chained.decision_id,
      ts: chained.timestamp,
      model_version: chained.model_version,
      policy_version: chained.policy_version,
      input_snapshot: chained.input_snapshot,
      output_snapshot: chained.output_snapshot,
      reason_codes: chained.reason_codes,
      compliance_flags: chained.compliance_flags,
      previous_hash: chained.previous_hash,
      hash: chained.hash,
    };
  } catch (e) {
    // Audit build failed; fall back to score-only upsert path below.
    await recordFailure({
      source: "UNDERWRITE",
      stage: "audit_build",
      parcelRef: parcel.id,
      countyFips: parcel.county_fips,
      error: e,
    });
  }

  if (auditPayload) {
    // One transactional RPC — either both writes commit, or neither does.
    const { error: rpcErr } = await (supabaseAdmin as any).rpc("record_underwrite_atomic", {
      p_score: row,
      p_audit: auditPayload,
    });
    if (rpcErr) {
      await recordFailure({
        source: "UNDERWRITE",
        stage: "record_underwrite_atomic",
        parcelRef: parcel.id,
        countyFips: parcel.county_fips,
        error: rpcErr,
      });
      throw new Error(rpcErr.message);
    }
  } else {
    // Degraded path: at least persist the score so the UI reflects the run.
    const { error: upsertErr } = await supabaseAdmin
      .from("parcel_scores")
      .upsert(row, { onConflict: "parcel_id" });
    if (upsertErr) {
      await recordFailure({
        source: "UNDERWRITE",
        stage: "score_upsert",
        parcelRef: parcel.id,
        countyFips: parcel.county_fips,
        error: upsertErr,
      });
      throw new Error(upsertErr.message);
    }
  }

  return { ok: true as const, perfect_score: u.perfect_score };
}
