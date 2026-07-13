/**
 * Prophecy query core. Extracted from the server function so it's unit-
 * testable without an HTTP context.
 *
 * Prophecy rules (leading, not lagging):
 *   - data_source = LIVE
 *   - parcels.is_listed = false        (the whole point — not yet on-market)
 *   - parcels.living_sqft / year_built present (real underwriting inputs)
 *   - perfect_score >= min_score
 *   - order: ring desc, perfect_score desc
 *   - NO active-trigger gate — that would defeat the "60-90 days early"
 *     purpose of the ring.
 */

export type ProphecyInput = {
  county_fips?: string;
  min_score: number;
  limit: number;
};

export const PROPHECY_SELECT =
  "parcel_id, perfect_score, gross_profit, risk_adjusted_profit, modeled_offer, acquisition_probability, exit_days, ring, confidence_grade, skeptic_flags, recommended_scope, reno_cost, data_source, computed_at, mc_profit_p5, mc_profit_p50, mc_p_loss, cosmetic_arv, full_reno_arv, expanded_arv, as_is_value, carry_cost, selling_cost, parcels!inner(id, address, city, state, zip, lat, lng, living_sqft, year_built, bedrooms, bathrooms, condition_grade, owner_is_absentee, is_listed, is_vacant, county_fips, data_source)";

export async function runProphecyQuery(supabase: any, input: ProphecyInput) {
  let q = supabase
    .from("parcel_scores")
    .select(PROPHECY_SELECT)
    .eq("data_source", "LIVE")
    .eq("parcels.is_listed", false)
    .not("parcels.living_sqft", "is", null)
    .not("parcels.year_built", "is", null)
    .gte("perfect_score", input.min_score)
    .order("ring", { ascending: false })
    .order("perfect_score", { ascending: false })
    .limit(input.limit);
  if (input.county_fips) q = q.eq("parcels.county_fips", input.county_fips);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  return rows ?? [];
}
