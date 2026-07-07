import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function serverClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const ListInput = z.object({
  county_fips: z.string().optional(),
  ring: z.number().int().min(1).max(3).optional(),
  min_score: z.number().optional(),
  min_profit: z.number().optional(),
  max_offer: z.number().optional(),
  include_fixture: z.boolean().default(false),
  limit: z.number().int().max(500).default(100),
});

export const listRankedParcels = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const supabase = serverClient();
    let q = supabase
      .from("parcel_scores")
      .select(
        "parcel_id, perfect_score, gross_profit, risk_adjusted_profit, modeled_offer, acquisition_probability, exit_days, ring, confidence_grade, skeptic_flags, recommended_scope, reno_cost, data_source, parcels!inner(id, address, city, state, zip, lat, lng, living_sqft, year_built, bedrooms, bathrooms, condition_grade, owner_is_absentee, is_listed, is_vacant, county_fips, data_source)",
      )
      .order("perfect_score", { ascending: false })
      .limit(data.limit);

    if (!data.include_fixture) q = q.eq("data_source", "LIVE");
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
  .inputValidator((data: unknown) => z.object({ parcel_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = serverClient();
    const [parcel, score, deeds, distress, listings] = await Promise.all([
      supabase.from("parcels").select("*").eq("id", data.parcel_id).single(),
      supabase.from("parcel_scores").select("*").eq("parcel_id", data.parcel_id).single(),
      supabase.from("deeds").select("*").eq("parcel_id", data.parcel_id).order("recorded_at", { ascending: false }),
      supabase.from("distress_events").select("*").eq("parcel_id", data.parcel_id).order("event_date", { ascending: false }),
      supabase.from("listings").select("*").eq("parcel_id", data.parcel_id).order("listed_at", { ascending: false }),
    ]);
    if (parcel.error) throw new Error(parcel.error.message);
    return {
      parcel: parcel.data,
      score: score.data,
      deeds: deeds.data ?? [],
      distress: distress.data ?? [],
      listings: listings.data ?? [],
    };
  });

export const getCoverage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverClient();
  const [counties, runs, scores, outcomes] = await Promise.all([
    supabase.from("counties").select("*").order("state").order("name"),
    supabase.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(30),
    supabase.from("parcel_scores").select("perfect_score, ring, confidence_grade"),
    supabase.from("prediction_outcomes").select("outcome, error_pct, predicted_profit, actual_profit"),
  ]);
  const s = scores.data ?? [];
  const tiers = {
    exceptional: s.filter((x) => x.perfect_score >= 80).length,
    strong: s.filter((x) => x.perfect_score >= 65 && x.perfect_score < 80).length,
    viable: s.filter((x) => x.perfect_score >= 50 && x.perfect_score < 65).length,
    watch: s.filter((x) => x.perfect_score < 50).length,
  };
  const rings = {
    r1: s.filter((x) => x.ring === 1).length,
    r2: s.filter((x) => x.ring === 2).length,
    r3: s.filter((x) => x.ring === 3).length,
  };
  const o = outcomes.data ?? [];
  const wins = o.filter((x) => x.outcome === "WIN").length;
  const losses = o.filter((x) => x.outcome === "LOSS").length;
  const stuck = o.filter((x) => x.outcome === "STUCK").length;
  const avgError = o.length
    ? o.reduce((a, b) => a + Math.abs(Number(b.error_pct ?? 0)), 0) / o.length
    : 0;
  return {
    counties: counties.data ?? [],
    runs: runs.data ?? [],
    tiers,
    rings,
    total_parcels: s.length,
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
