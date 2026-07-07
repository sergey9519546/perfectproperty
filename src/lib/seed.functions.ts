import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MARKET_CONTEXT, underwrite, type ParcelInput, type DistressInput } from "./engine";

// service-role client (admin) is required for bulk writes bypassing RLS.
async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Deterministic PRNG so the seed is reproducible.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNTIES = [
  { fips: "06037", state: "CA", name: "Los Angeles County", lat: 34.0522, lng: -118.2437, cities: ["Los Angeles", "Long Beach", "Glendale", "Pasadena", "Torrance", "Inglewood", "Lancaster", "Palmdale"] },
  { fips: "06073", state: "CA", name: "San Diego County", lat: 32.7157, lng: -117.1611, cities: ["San Diego", "Chula Vista", "Oceanside", "Escondido", "El Cajon", "Vista"] },
  { fips: "12086", state: "FL", name: "Miami-Dade County", lat: 25.7617, lng: -80.1918, cities: ["Miami", "Hialeah", "Miami Beach", "Homestead", "Miami Gardens", "Coral Gables"] },
  { fips: "12011", state: "FL", name: "Broward County", lat: 26.1224, lng: -80.1373, cities: ["Fort Lauderdale", "Hollywood", "Pembroke Pines", "Coral Springs", "Miramar", "Sunrise"] },
];

const STREETS = ["Oak", "Maple", "Cedar", "Sunset", "Ocean", "Palm", "Magnolia", "Pine", "Willow", "Ridge", "Valley", "Hillcrest", "Park", "Lincoln", "Jefferson"];
const SUFFIX = ["St", "Ave", "Blvd", "Dr", "Ln", "Way", "Ct"];
const OWNERS_LAST = ["Ramirez", "Nguyen", "Johnson", "Patel", "Kim", "Garcia", "Brown", "Cohen", "Silva", "Wong", "Martinez", "Anderson"];
const OWNERS_FIRST = ["Maria", "David", "Aisha", "James", "Priya", "Ben", "Sofia", "Kenji", "Luis", "Grace"];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export const seedFixtures = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = await adminClient();
  const rng = mulberry32(20260707);

  // Wipe prior seed
  await supabase.from("prediction_outcomes").delete().gte("predicted_at", "1900-01-01");
  await supabase.from("parcel_scores").delete().gt("as_is_value", -1);
  await supabase.from("distress_events").delete().gte("event_date", "1900-01-01");
  await supabase.from("listings").delete().gte("listed_at", "1900-01-01");
  await supabase.from("deeds").delete().gte("recorded_at", "1900-01-01");
  await supabase.from("parcels").delete().neq("apn", "___");
  await supabase.from("ingestion_runs").delete().gte("started_at", "1900-01-01");
  await supabase.from("counties").delete().neq("fips", "___");

  // Counties
  const countyRows = COUNTIES.map((c) => ({
    fips: c.fips, state: c.state, name: c.name,
    center_lat: c.lat, center_lng: c.lng,
    parcel_count: 0, last_ingested_at: new Date().toISOString(), coverage_pct: 100,
  }));
  await supabase.from("counties").insert(countyRows);

  const PARCELS_PER_COUNTY = 90;
  const allParcels: any[] = [];
  const allDeeds: any[] = [];
  const allDistress: any[] = [];
  const allListings: any[] = [];
  const runs: any[] = [];

  for (const c of COUNTIES) {
    for (let i = 0; i < PARCELS_PER_COUNTY; i++) {
      const jitterLat = (rng() - 0.5) * 0.35;
      const jitterLng = (rng() - 0.5) * 0.45;
      const yb = 1930 + Math.floor(rng() * 90);
      const sqft = 780 + Math.floor(rng() * 2200);
      const lot = 3500 + Math.floor(rng() * 9500);
      const beds = 2 + Math.floor(rng() * 4);
      const baths = 1 + Math.floor(rng() * 3) * 0.5 + 1;
      const conditionRoll = rng();
      const condition = conditionRoll < 0.15 ? "D" : conditionRoll < 0.4 ? "C" : conditionRoll < 0.8 ? "B" : "A";
      const flood = c.state === "FL" && rng() < 0.28 ? (rng() < 0.5 ? "AE" : "X") : "X";
      const school = 3 + Math.floor(rng() * 8);
      const absentee = rng() < 0.28;
      const corporate = absentee && rng() < 0.35;
      const ownerSinceYear = 1995 + Math.floor(rng() * 28);
      const listed = rng() < 0.18;
      const vacant = !listed && rng() < 0.11;

      const stateBase = c.state === "CA" ? 550 : 380;
      const assessed = Math.round(sqft * (stateBase + (rng() - 0.5) * 180) * (condition === "D" ? 0.7 : condition === "C" ? 0.85 : 1));
      const equity = Math.round(assessed * (0.35 + rng() * 0.55));

      const parcelId = crypto.randomUUID();
      const city = pick(rng, c.cities);
      const address = `${100 + Math.floor(rng() * 9800)} ${pick(rng, STREETS)} ${pick(rng, SUFFIX)}`;
      const zip = c.state === "CA" ? String(90001 + Math.floor(rng() * 500)) : String(33000 + Math.floor(rng() * 400));

      allParcels.push({
        id: parcelId, apn: `${c.fips}-${String(i).padStart(5, "0")}`,
        county_fips: c.fips, address, city, state: c.state, zip,
        lat: c.lat + jitterLat, lng: c.lng + jitterLng,
        property_type: "SFR", year_built: yb, living_sqft: sqft, lot_sqft: lot,
        bedrooms: beds, bathrooms: baths, stories: rng() < 0.3 ? 2 : 1,
        condition_grade: condition, flood_zone: flood, school_score: school,
        owner_name: `${pick(rng, OWNERS_FIRST)} ${pick(rng, OWNERS_LAST)}${corporate ? " Holdings LLC" : ""}`,
        owner_is_absentee: absentee, owner_is_corporate: corporate,
        owner_since: `${ownerSinceYear}-0${1 + Math.floor(rng() * 9)}-15`,
        assessed_value: assessed, estimated_equity: equity,
        is_listed: listed, is_vacant: vacant,
      });

      // Deeds — 1..3 historical
      const numDeeds = 1 + Math.floor(rng() * 3);
      let prevPrice = Math.round(assessed * 0.55);
      let prevYear = ownerSinceYear;
      for (let d = 0; d < numDeeds; d++) {
        allDeeds.push({
          parcel_id: parcelId,
          recorded_at: `${prevYear}-0${1 + Math.floor(rng() * 9)}-12`,
          deed_type: "WARRANTY",
          sale_price: prevPrice,
          buyer: `Buyer ${d + 1}`, seller: `Seller ${d + 1}`,
          loan_amount: Math.round(prevPrice * 0.78),
        });
        prevYear += 4 + Math.floor(rng() * 5);
        prevPrice = Math.round(prevPrice * (1.2 + rng() * 0.4));
      }

      // Distress — probabilistic layering
      const distressForParcel: DistressInput[] = [];
      if (rng() < 0.09) {
        const evDate = new Date(); evDate.setDate(evDate.getDate() - Math.floor(rng() * 90));
        const auc = new Date(evDate); auc.setDate(auc.getDate() + 60 + Math.floor(rng() * 60));
        const row = {
          parcel_id: parcelId, event_type: "FORECLOSURE_NOD",
          event_date: evDate.toISOString().slice(0, 10),
          severity: 4, amount: Math.round(assessed * 0.7),
          auction_date: rng() < 0.4 ? auc.toISOString().slice(0, 10) : null,
          details: { lender: "Regional Bank" },
        };
        allDistress.push(row);
        distressForParcel.push({ event_type: row.event_type, severity: row.severity, amount: row.amount, event_date: row.event_date, auction_date: row.auction_date });
      }
      if (rng() < 0.14) {
        const row = { parcel_id: parcelId, event_type: "TAX_LIEN", event_date: `2025-0${1 + Math.floor(rng() * 9)}-01`, severity: 3, amount: Math.round(5000 + rng() * 45000), auction_date: null, details: {} };
        allDistress.push(row);
        distressForParcel.push({ event_type: row.event_type, severity: row.severity, amount: row.amount, event_date: row.event_date, auction_date: null });
      }
      if (rng() < 0.06) {
        const row = { parcel_id: parcelId, event_type: "PROBATE", event_date: `2025-0${1 + Math.floor(rng() * 9)}-10`, severity: 3, amount: null, auction_date: null, details: { estate: `Est. of ${pick(rng, OWNERS_LAST)}` } };
        allDistress.push(row);
        distressForParcel.push({ event_type: row.event_type, severity: row.severity, amount: null, event_date: row.event_date, auction_date: null });
      }
      if (rng() < 0.05) {
        const row = { parcel_id: parcelId, event_type: "CODE_VIOLATION", event_date: `2025-0${1 + Math.floor(rng() * 9)}-20`, severity: 2, amount: Math.round(500 + rng() * 8000), auction_date: null, details: {} };
        allDistress.push(row);
        distressForParcel.push({ event_type: row.event_type, severity: row.severity, amount: row.amount, event_date: row.event_date, auction_date: null });
      }
      if (vacant) {
        const row = { parcel_id: parcelId, event_type: "VACANCY", event_date: "2025-06-01", severity: 2, amount: null, auction_date: null, details: { verified: "USPS + utility" } };
        allDistress.push(row);
        distressForParcel.push({ event_type: row.event_type, severity: row.severity, amount: null, event_date: row.event_date, auction_date: null });
      }

      // Listings for the currently-listed ones
      if (listed) {
        const listPrice = Math.round(assessed * (0.85 + rng() * 0.4));
        allListings.push({
          parcel_id: parcelId, listed_at: "2025-04-15", list_price: listPrice,
          original_price: Math.round(listPrice * (1 + rng() * 0.08)),
          status: "ACTIVE", dom: 20 + Math.floor(rng() * 90), price_cuts: rng() < 0.4 ? 1 : 0,
        });
      }

      // Underwrite immediately
      const pInput: ParcelInput = {
        living_sqft: sqft, lot_sqft: lot, year_built: yb, bedrooms: beds, bathrooms: baths,
        condition_grade: condition, flood_zone: flood, school_score: school,
        assessed_value: assessed, estimated_equity: equity,
        owner_is_absentee: absentee, owner_since: `${ownerSinceYear}-01-15`,
        is_listed: listed, is_vacant: vacant, state: c.state,
      };
      const u = underwrite(pInput, distressForParcel, MARKET_CONTEXT[c.fips]!);
      allDeeds; // hush
      // parcel_scores queued below
      (u as any)._parcel_id = parcelId;
    }
    runs.push({
      county_fips: c.fips, source: "PARCELS", status: "OK",
      rows_ingested: PARCELS_PER_COUNTY, notes: "Fixture ingestion — replace with Regrid/county GIS adapter",
      started_at: new Date(Date.now() - 60000).toISOString(),
      finished_at: new Date().toISOString(),
    });
    runs.push({
      county_fips: c.fips, source: "DEEDS", status: "OK",
      rows_ingested: Math.round(PARCELS_PER_COUNTY * 1.8), notes: "Fixture — county recorder adapter pending",
      started_at: new Date(Date.now() - 55000).toISOString(),
      finished_at: new Date().toISOString(),
    });
    runs.push({
      county_fips: c.fips, source: "DISTRESS", status: "PARTIAL",
      rows_ingested: Math.round(PARCELS_PER_COUNTY * 0.4), notes: "Fixture — foreclosure + tax + probate + code",
      started_at: new Date(Date.now() - 50000).toISOString(),
      finished_at: new Date().toISOString(),
    });
    runs.push({
      county_fips: c.fips, source: "MLS", status: "OK",
      rows_ingested: Math.round(PARCELS_PER_COUNTY * 0.18), notes: "Fixture — requires RESO/broker feed",
      started_at: new Date(Date.now() - 40000).toISOString(),
      finished_at: new Date().toISOString(),
    });
  }

  // Batch inserts
  await supabase.from("parcels").insert(allParcels);
  if (allDeeds.length) await supabase.from("deeds").insert(allDeeds);
  if (allDistress.length) await supabase.from("distress_events").insert(allDistress);
  if (allListings.length) await supabase.from("listings").insert(allListings);
  await supabase.from("ingestion_runs").insert(runs);

  // Update county counts
  for (const c of COUNTIES) {
    await supabase.from("counties").update({ parcel_count: PARCELS_PER_COUNTY }).eq("fips", c.fips);
  }

  return { parcels: allParcels.length, deeds: allDeeds.length, distress: allDistress.length, listings: allListings.length };
});

export const runUnderwrite = createServerFn({ method: "POST" }).handler(async () => {
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
  const outcomes: any[] = [];
  for (const p of parcels ?? []) {
    const m = MARKET_CONTEXT[p.county_fips];
    if (!m) continue;
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
    });

    // Layer 5: synthesize a plausible historical outcome for ~15% of parcels
    if (Math.random() < 0.15) {
      const actualArv = u.full_reno_arv * (0.88 + Math.random() * 0.22);
      const actualProfit = actualArv - u.modeled_offer - u.reno_cost * (0.95 + Math.random() * 0.25) - u.carry_cost - u.selling_cost;
      const outcome = actualProfit > 15000 ? "WIN" : actualProfit > -2000 ? "BREAKEVEN" : actualProfit < -15000 ? "LOSS" : "STUCK";
      const errorPct = ((actualArv - u.full_reno_arv) / u.full_reno_arv) * 100;
      outcomes.push({
        parcel_id: p.id, predicted_arv: u.full_reno_arv, predicted_profit: u.gross_profit,
        predicted_at: new Date(Date.now() - 90 * 86400 * 1000).toISOString(),
        actual_sale_price: Math.round(actualArv), actual_profit: Math.round(actualProfit),
        actual_sold_at: new Date().toISOString().slice(0, 10),
        outcome, error_pct: Math.round(errorPct * 100) / 100,
      });
    }
  }

  // Upsert scores
  await supabase.from("parcel_scores").delete().gt("as_is_value", -1);
  const CHUNK = 200;
  for (let i = 0; i < scores.length; i += CHUNK) {
    await supabase.from("parcel_scores").insert(scores.slice(i, i + CHUNK));
  }
  if (outcomes.length) {
    await supabase.from("prediction_outcomes").delete().gte("predicted_at", "1900-01-01");
    await supabase.from("prediction_outcomes").insert(outcomes);
  }

  await supabase.from("ingestion_runs").insert({
    county_fips: "06037", source: "AGGREGATOR", status: "OK",
    rows_ingested: scores.length, notes: `Nightly underwrite complete — ${scores.length} parcels scored`,
    finished_at: new Date().toISOString(),
  });

  return { scored: scores.length, outcomes: outcomes.length };
});
