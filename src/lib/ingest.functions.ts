/**
 * Real ingestion pipeline.
 *
 * For each county configured in COUNTY_SOURCES, hit its public GIS
 * endpoint, normalize the fields, enrich with FEMA flood zone, and upsert
 * into the parcels table. Every run is logged to ingestion_runs with the
 * exact source, row count, and any error surfaced by the upstream service.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COUNTY_SOURCES, type CountySource } from "./adapters/sources";
import { arcgisQuery, featureCentroid, type ArcGISFeature } from "./adapters/arcgis";
import { socrataQuery } from "./adapters/socrata";
import { femaFloodZoneAt } from "./adapters/fema";
import { MARKET_CONTEXT, underwrite, type ParcelInput, type DistressInput } from "./engine";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const RunInput = z.object({
  county_fips: z.string(),
  max_parcels: z.number().int().min(1).max(2000).default(300),
  enrich_flood: z.boolean().default(true),
});

function inferCondition(yearBuilt: number | null): "A" | "B" | "C" | "D" {
  if (!yearBuilt) return "B";
  const age = new Date().getFullYear() - yearBuilt;
  if (age < 15) return "A";
  if (age < 40) return "B";
  if (age < 70) return "C";
  return "D";
}

async function fetchParcelsFromArcGIS(src: CountySource, max: number): Promise<any[]> {
  if (!src.parcels || src.parcels.kind !== "ARCGIS") return [];
  const CHUNK = 100;
  const out: any[] = [];
  for (let offset = 0; offset < max; offset += CHUNK) {
    const feats = await arcgisQuery(src.parcels.url, {
      resultRecordCount: Math.min(CHUNK, max - offset),
      resultOffset: offset,
      outFields: "*",
      returnGeometry: true,
    });
    if (feats.length === 0) break;
    for (const f of feats) out.push(normalizeArcGISFeature(f, src));
    if (feats.length < CHUNK) break;
  }
  return out;
}

async function fetchParcelsFromSocrata(src: CountySource, max: number): Promise<any[]> {
  if (!src.parcels || src.parcels.kind !== "SOCRATA") return [];
  const rows = await socrataQuery(src.parcels.url, { limit: max });
  return rows.map((r) => normalizeSocrataRow(r, src));
}

function normalizeArcGISFeature(f: ArcGISFeature, src: CountySource) {
  const a = f.attributes;
  const c = src.parcels!;
  const center = featureCentroid(f) ?? { lat: src.center[0], lng: src.center[1] };
  const yb = c.field_year_built ? Number(a[c.field_year_built]) || null : null;
  const sqft = c.field_living_sqft ? Number(a[c.field_living_sqft]) || null : null;
  const lot = c.field_lot_sqft ? Number(a[c.field_lot_sqft]) || null : null;
  return {
    apn: String(a[c.field_apn ?? "OBJECTID"] ?? crypto.randomUUID()),
    county_fips: src.fips,
    address: c.field_address ? String(a[c.field_address] ?? "").trim() || "Address unknown" : "Address unknown",
    city: c.field_city ? String(a[c.field_city] ?? "").trim() || null : null,
    state: src.state,
    zip: c.field_zip ? String(a[c.field_zip] ?? "").trim() || null : null,
    lat: center.lat,
    lng: center.lng,
    property_type: "SFR",
    year_built: yb,
    living_sqft: sqft,
    lot_sqft: lot,
    bedrooms: c.field_beds ? Number(a[c.field_beds]) || null : null,
    bathrooms: c.field_baths ? Number(a[c.field_baths]) || null : null,
    condition_grade: inferCondition(yb),
    flood_zone: "X",
    school_score: 6,
    owner_name: c.field_owner ? String(a[c.field_owner] ?? "").trim() || null : null,
    owner_is_absentee: false,
    owner_is_corporate: false,
    assessed_value: c.field_assessed ? Number(a[c.field_assessed]) || null : null,
    estimated_equity: null,
    is_listed: false,
    is_vacant: false,
  };
}

function normalizeSocrataRow(r: Record<string, any>, src: CountySource) {
  const c = src.parcels!;
  let address = "Address unknown";
  let city: string | null = null;
  if (c.address_builder === "sf") {
    const num = r.from_address_num ?? r.to_address_num ?? "";
    const street = [r.street_name, r.street_type].filter(Boolean).join(" ");
    address = `${num} ${street}`.trim() || "Address unknown";
    city = "San Francisco";
  } else if (c.address_builder === "nyc") {
    address = String(r.address ?? "").trim() || "Address unknown";
    city = { BX: "Bronx", BK: "Brooklyn", MN: "Manhattan", QN: "Queens", SI: "Staten Island" }[r.borough as string] ?? null;
  } else if (c.field_address) {
    address = String(r[c.field_address] ?? "").trim() || "Address unknown";
    city = c.field_city ? String(r[c.field_city] ?? "").trim() || null : null;
  }
  const yb = c.field_year_built ? Number(r[c.field_year_built]) || null : null;
  const sqft = c.field_living_sqft ? Number(r[c.field_living_sqft]) || null : null;
  // NYC lat/lng comes from latitude/longitude fields; SF from location
  let lat = src.center[0], lng = src.center[1];
  if (r.latitude && r.longitude) { lat = Number(r.latitude); lng = Number(r.longitude); }
  else if (r.location?.latitude && r.location?.longitude) { lat = Number(r.location.latitude); lng = Number(r.location.longitude); }
  // NYC PLUTO returns `bbl` as a numeric field which arrives as "2032020044.00000000".
  // Sales use the 10-digit BBL string, so strip the decimal noise here so joins match.
  let apn = String(r[c.field_apn ?? "id"] ?? crypto.randomUUID());
  if (c.address_builder === "nyc") apn = apn.replace(/\..*$/, "").replace(/^0+/, "") || apn;
  // NYC: map the borough letter → real per-county FIPS so sales/parcels agree.
  const NYC_FIPS: Record<string, string> = { MN: "36061", BX: "36005", BK: "36047", QN: "36081", SI: "36085" };
  const county_fips = c.address_builder === "nyc" && NYC_FIPS[r.borough as string]
    ? NYC_FIPS[r.borough as string]!
    : src.fips;
  return {
    apn,
    county_fips,
    address, city, state: src.state,
    zip: c.field_zip ? String(r[c.field_zip] ?? "").trim() || null : null,
    lat, lng,
    property_type: "SFR",
    year_built: yb,
    living_sqft: sqft,
    lot_sqft: c.field_lot_sqft ? Number(r[c.field_lot_sqft]) || null : null,
    bedrooms: null,
    bathrooms: null,
    condition_grade: inferCondition(yb),
    flood_zone: "X",
    school_score: 6,
    owner_name: c.field_owner ? String(r[c.field_owner] ?? "").trim() || null : null,
    owner_is_absentee: false,
    owner_is_corporate: false,
    assessed_value: c.field_assessed ? Number(r[c.field_assessed]) || null : null,
    estimated_equity: null,
    is_listed: false,
    is_vacant: false,
  };
}

export const ingestCounty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data }) => {
    const src = COUNTY_SOURCES.find((s) => s.fips === data.county_fips);
    if (!src) throw new Error(`Unknown county ${data.county_fips}`);
    const supabase = await adminClient();
    const started = new Date().toISOString();

    // Ensure county row(s). For NYC, ensure all 5 boroughs because the PLUTO
    // normalizer splits parcels across per-borough FIPS.
    const countyRows = [{ fips: src.fips, state: src.state, name: src.name,
      center_lat: src.center[0], center_lng: src.center[1],
      last_ingested_at: started, coverage_pct: 100, parcel_count: 0 }];
    if (src.parcels?.address_builder === "nyc") {
      const NYC = [
        { fips: "36061", name: "NYC · Manhattan" },
        { fips: "36005", name: "NYC · Bronx" },
        { fips: "36047", name: "NYC · Brooklyn" },
        { fips: "36081", name: "NYC · Queens" },
        { fips: "36085", name: "NYC · Staten Island" },
      ];
      for (const c of NYC) countyRows.push({
        fips: c.fips, state: "NY", name: c.name,
        center_lat: 40.7128, center_lng: -74.006,
        last_ingested_at: started, coverage_pct: 100, parcel_count: 0,
      });
    }
    for (const row of countyRows) await supabase.from("counties").upsert(row, { onConflict: "fips" });

    let parcels: any[] = [];
    let status: "OK" | "PARTIAL" | "FAIL" = "OK";
    let note = "";
    try {
      if (src.parcels?.kind === "ARCGIS") parcels = await fetchParcelsFromArcGIS(src, data.max_parcels);
      else if (src.parcels?.kind === "SOCRATA") parcels = await fetchParcelsFromSocrata(src, data.max_parcels);
      else throw new Error("No parcel source configured");
      note = `Fetched ${parcels.length} from ${src.parcels?.url}`;
    } catch (e: any) {
      status = "FAIL";
      note = `Upstream error: ${e.message}`;
    }

    // FEMA enrichment (sampled — hitting FEMA for every parcel is too slow)
    if (data.enrich_flood && parcels.length && status === "OK") {
      const SAMPLE = Math.min(parcels.length, 25);
      for (let i = 0; i < SAMPLE; i++) {
        const p = parcels[Math.floor((i / SAMPLE) * parcels.length)];
        p.flood_zone = await femaFloodZoneAt(p.lat, p.lng);
      }
    }

    // Upsert parcels on (county_fips, apn). NEVER wipe LIVE data; append/refresh.
    let inserted = 0;
    if (parcels.length) {
      const url = src.parcels?.url ?? null;
      // De-dupe on the upsert key so ON CONFLICT DO UPDATE doesn't hit the same row twice.
      const seen = new Set<string>();
      const stamped = parcels
        .map((p) => ({ ...p, data_source: "LIVE", source_url: url, last_seen_at: new Date().toISOString() }))
        .filter((p) => {
          const k = `${p.county_fips}|${p.apn}`;
          if (seen.has(k)) return false;
          seen.add(k); return true;
        });
      const CHUNK = 200;
      for (let i = 0; i < stamped.length; i += CHUNK) {
        const chunk = stamped.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("parcels")
          .upsert(chunk, { onConflict: "county_fips,apn" });
        if (error) {
          status = "PARTIAL";
          note = `Upsert error: ${error.message}`;
          break;
        }
        inserted += chunk.length;
      }
      // Refresh parcel_count on every county touched.
      const touched = Array.from(new Set(stamped.map((p) => p.county_fips)));
      for (const fips of touched) {
        const { count } = await supabase
          .from("parcels").select("id", { count: "exact", head: true })
          .eq("county_fips", fips);
        await supabase.from("counties").update({ parcel_count: count ?? 0 }).eq("fips", fips);
      }
    }

    await supabase.from("ingestion_runs").insert({
      county_fips: src.fips, source: "PARCELS", status,
      rows_ingested: inserted, notes: note,
      started_at: started, finished_at: new Date().toISOString(),
    });

    return { fips: src.fips, name: src.name, fetched: parcels.length, inserted, status, note };
  });

// Score only LIVE parcels. Fixture scoring is handled by runUnderwrite.
export const scoreAll = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = await adminClient();
  const { data: parcels, error } = await supabase
    .from("parcels").select("*").eq("data_source", "LIVE");
  if (error) throw new Error(error.message);
  const parcelIds = (parcels ?? []).map((p) => p.id);
  const byParcel = new Map<string, DistressInput[]>();
  if (parcelIds.length) {
    const { data: distress } = await supabase
      .from("distress_events").select("*").in("parcel_id", parcelIds);
    for (const d of distress ?? []) {
      const arr = byParcel.get(d.parcel_id) ?? [];
      arr.push({
        event_type: d.event_type, severity: d.severity, amount: d.amount,
        event_date: d.event_date, auction_date: d.auction_date,
      });
      byParcel.set(d.parcel_id, arr);
    }
  }

  const scores: any[] = [];
  for (const p of parcels ?? []) {
    const m = MARKET_CONTEXT[p.county_fips] ?? {
      median_ppsf: 400, ppsf_stddev: 110, avg_dom_renovated: 55, pending_ratio: 0.35, momentum: 0,
    };
    const input: ParcelInput = {
      living_sqft: p.living_sqft, lot_sqft: p.lot_sqft, year_built: p.year_built,
      bedrooms: p.bedrooms, bathrooms: p.bathrooms ? Number(p.bathrooms) : null,
      condition_grade: p.condition_grade, flood_zone: p.flood_zone, school_score: p.school_score,
      assessed_value: p.assessed_value ? Number(p.assessed_value) : null,
      estimated_equity: p.estimated_equity ? Number(p.estimated_equity) : null,
      owner_is_absentee: p.owner_is_absentee, owner_since: p.owner_since,
      is_listed: p.is_listed, is_vacant: p.is_vacant, state: p.state,
    };

    // Pull real comps via the pick_comps RPC — only when we have geometry + sqft.
    let comps: any[] = [];
    if (p.lat != null && p.lng != null && (p.living_sqft ?? 0) > 100) {
      const { data: cRows } = await (supabase as any).rpc("pick_comps", {
        subject_lat: p.lat,
        subject_lng: p.lng,
        subject_sqft: p.living_sqft,
        subject_county: p.county_fips,
      });
      comps = (cRows ?? []).map((c: any) => ({
        ppsf: Number(c.ppsf),
        distance_km: Number(c.distance_km),
        sale_id: c.sale_id,
        address: c.address,
        sold_at: c.sold_at,
        sale_price: Number(c.sale_price),
        living_sqft: c.living_sqft,
      }));
    }

    const u = underwrite(input, byParcel.get(p.id) ?? [], m, comps);
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
      data_source: "LIVE",
      comps_used: comps,
      comp_count: u.comp_count,
      arv_source: u.arv_source,
    });
  }
  // Only wipe LIVE scores; leave fixture scores alone.
  await supabase.from("parcel_scores").delete().eq("data_source", "LIVE");
  const CHUNK = 200;
  for (let i = 0; i < scores.length; i += CHUNK) {
    await supabase.from("parcel_scores").insert(scores.slice(i, i + CHUNK));
  }
  const compBacked = scores.filter((s) => s.arv_source === "COMPS").length;
  return { scored: scores.length, comps_backed: compBacked };
});

export const listSources = createServerFn({ method: "GET" }).handler(async () => {
  return COUNTY_SOURCES.map((s) => ({
    fips: s.fips, state: s.state, name: s.name,
    parcels: s.parcels ? { kind: s.parcels.kind, url: s.parcels.url } : null,
    distress: s.distress ?? null,
  }));
});
