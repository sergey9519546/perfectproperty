import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { realieLookupAddress, realieToParcelRow } from "@/lib/adapters/realie";
import { underwrite, MARKET_CONTEXT, type ParcelInput, type DistressInput } from "@/lib/engine";
import { appendDecision, type DecisionRecord } from "@/lib/engine/warehouse";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ListInput = z.object({
  county_fips: z.string().optional(),
  ring: z.number().int().min(1).max(3).optional(),
  min_score: z.number().optional(),
  min_profit: z.number().optional(),
  max_offer: z.number().optional(),
  limit: z.number().int().max(500).default(100),
});

export const listRankedParcels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ListInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // Gate 1: only parcels with a real deal trigger in the last 180 days
    // (distress event or active listing). No trigger = no reason to be on
    // the map, regardless of score.
    const { data: triggerRows, error: trigErr } = await (supabase as any)
      .rpc("parcels_with_active_trigger", { _days: 180 });
    if (trigErr) throw new Error(trigErr.message);
    const triggeredIds = ((triggerRows ?? []) as Array<{ parcel_id: string }>)
      .map((r) => r.parcel_id)
      .filter(Boolean);
    if (triggeredIds.length === 0) return [];

    // Gate 2: require real underwriting inputs (living_sqft + year_built).
    // Without them the underwrite falls back to defaults and every row
    // collapses to the same "mock" numbers.
    let q = supabase
      .from("parcel_scores")
      .select(
        "parcel_id, perfect_score, gross_profit, risk_adjusted_profit, modeled_offer, acquisition_probability, exit_days, ring, confidence_grade, skeptic_flags, recommended_scope, reno_cost, data_source, computed_at, mc_profit_p5, mc_profit_p50, mc_p_loss, cosmetic_arv, full_reno_arv, expanded_arv, as_is_value, carry_cost, selling_cost, ead, pd_credit, lgd, risk_adjusted_profit_credit, parcels!inner(id, address, city, state, zip, lat, lng, living_sqft, year_built, bedrooms, bathrooms, condition_grade, owner_is_absentee, is_listed, is_vacant, county_fips, data_source)",
      )
      .eq("data_source", "LIVE")
      .in("parcel_id", triggeredIds)
      .not("parcels.living_sqft", "is", null)
      .not("parcels.year_built", "is", null)
      .order("perfect_score", { ascending: false })
      .limit(data.limit);

    if (data.ring) q = q.eq("ring", data.ring);
    if (data.min_score !== undefined) q = q.gte("perfect_score", data.min_score);
    if (data.min_profit !== undefined) q = q.gte("gross_profit", data.min_profit);
    if (data.max_offer !== undefined) q = q.lte("modeled_offer", data.max_offer);
    if (data.county_fips) q = q.eq("parcels.county_fips", data.county_fips);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const getDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ parcel_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const [parcel, score, deeds, distress, listings] = await Promise.all([
      supabase.from("parcels").select("*").eq("id", data.parcel_id).maybeSingle(),
      supabase.from("parcel_scores").select("*").eq("parcel_id", data.parcel_id).maybeSingle(),
      supabase.from("deeds").select("*").eq("parcel_id", data.parcel_id).order("recorded_at", { ascending: false }),
      supabase.from("distress_events").select("*").eq("parcel_id", data.parcel_id).order("event_date", { ascending: false }),
      supabase.from("listings").select("*").eq("parcel_id", data.parcel_id).order("listed_at", { ascending: false }),
    ]);
    if (parcel.error) throw new Error(parcel.error.message);
    if (!parcel.data) throw new Error("Parcel not found");
    return {
      parcel: parcel.data,
      score: score.data ?? null,
      deeds: deeds.data ?? [],
      distress: distress.data ?? [],
      listings: listings.data ?? [],
    };
  });

// ---------------------------------------------------------------------------
// Realie-powered single-address lookup + underwrite in one call.
// ---------------------------------------------------------------------------
const LookupInput = z.object({
  address: z.string().min(3),
  state: z.string().length(2),
  city: z.string().optional(),
  county: z.string().optional(),
  unit: z.string().optional(),
});

export const lookupParcelByAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => LookupInput.parse(data))
  .handler(async ({ data }) => {
    const { lookupParcelByAddressCore } = await import("@/lib/parcels-core");
    return lookupParcelByAddressCore(data);
  });


export const getCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  const supabase = context.supabase;
  const [counties, runs, scores, outcomes, liveByCounty] = await Promise.all([
    supabase.from("counties").select("*").order("state").order("name"),
    supabase.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(30),
    // Match the same real-inputs filter as listRankedParcels so counts don't
    // include parcels underwritten off defaults.
    supabase
      .from("parcel_scores")
      .select("perfect_score, ring, confidence_grade, data_source, parcels!inner(living_sqft, year_built)")
      .eq("data_source", "LIVE")
      .not("parcels.living_sqft", "is", null)
      .not("parcels.year_built", "is", null),
    supabase.from("prediction_outcomes").select("outcome, error_pct, predicted_profit, actual_profit"),
    supabase.from("parcels").select("county_fips").eq("data_source", "LIVE").not("living_sqft", "is", null).not("year_built", "is", null),
  ]);
  const sLive = (scores.data ?? []) as any[];
  const tiers = {
    exceptional: sLive.filter((x: any) => x.perfect_score >= 80).length,
    strong: sLive.filter((x: any) => x.perfect_score >= 65 && x.perfect_score < 80).length,
    viable: sLive.filter((x: any) => x.perfect_score >= 50 && x.perfect_score < 65).length,
    watch: sLive.filter((x: any) => x.perfect_score < 50).length,
  };
  const rings = {
    r1: sLive.filter((x: any) => x.ring === 1).length,
    r2: sLive.filter((x: any) => x.ring === 2).length,
    r3: sLive.filter((x: any) => x.ring === 3).length,
  };
  const liveCounts: Record<string, number> = {};
  for (const r of (liveByCounty.data ?? []) as any[]) liveCounts[r.county_fips] = (liveCounts[r.county_fips] ?? 0) + 1;
  const countiesEnriched = (counties.data ?? []).map((c: any) => ({
    ...c,
    live_parcels: liveCounts[c.fips] ?? 0,
  }));

  const o = (outcomes.data ?? []) as any[];
  const wins = o.filter((x: any) => x.outcome === "WIN").length;
  const losses = o.filter((x: any) => x.outcome === "LOSS").length;
  const stuck = o.filter((x: any) => x.outcome === "STUCK").length;
  const avgError = o.length
    ? o.reduce((a: number, b: any) => a + Math.abs(Number(b.error_pct ?? 0)), 0) / o.length
    : 0;
  return {
    counties: countiesEnriched,
    runs: runs.data ?? [],
    tiers,
    rings,
    total_parcels: sLive.length,
    live_totals: { parcels: (liveByCounty.data ?? []).length, scored: sLive.length },
    accuracy: {
      total: o.length,
      wins,
      losses,
      stuck,
      win_rate: o.length ? wins / o.length : 0,
      mean_abs_error_pct: avgError,
    },
    outcomes: o,
  };
});

