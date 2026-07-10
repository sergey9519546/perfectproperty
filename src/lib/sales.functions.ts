/**
 * Ingest real arms-length sales from public sources.
 * Currently wired: NYC DOF Rolling Sales (5 boroughs).
 *
 * Each sale is upserted on (county_fips, external_apn, sold_at, sale_price)
 * and linked back to a parcel row when the BBL/APN matches something we've
 * already ingested (so pick_comps can use parcel geometry for distance).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/require-admin";
import { fetchNycSales, nycBoroughs, boroughFor } from "./adapters/nyc-sales";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const RunInput = z.object({
  county_fips: z.string(),
  limit: z.number().int().min(1).max(5000).default(1000),
});

export const ingestSales = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = await adminClient();
    const b = boroughFor(data.county_fips);
    if (!b) {
      return { fips: data.county_fips, status: "SKIP", note: "no sales adapter for this county", inserted: 0 };
    }

    // Ensure county exists so FK holds
    await supabase.from("counties").upsert(
      { fips: b.fips, state: "NY", name: `NYC · ${b.name}`, center_lat: 40.7128, center_lng: -74.006 },
      { onConflict: "fips" },
    );

    const started = new Date().toISOString();
    let rows: Awaited<ReturnType<typeof fetchNycSales>> = [];
    let status: "OK" | "PARTIAL" | "FAIL" = "OK";
    let note = "";
    try {
      rows = await fetchNycSales(b.fips, data.limit);
      note = `Fetched ${rows.length} sales from ${b.url}`;
    } catch (e: any) {
      status = "FAIL";
      note = `Upstream error: ${e.message}`;
    }

    // Resolve external_apn → parcel_id for the county in one query
    let apnToParcel = new Map<string, string>();
    if (rows.length) {
      const apns = Array.from(new Set(rows.map((r) => r.external_apn)));
      const CHUNK = 500;
      for (let i = 0; i < apns.length; i += CHUNK) {
        const { data: matches } = await supabase
          .from("parcels")
          .select("id, apn")
          .eq("county_fips", b.fips)
          .in("apn", apns.slice(i, i + CHUNK));
        for (const m of matches ?? []) apnToParcel.set((m as any).apn, (m as any).id);
      }
    }

    let inserted = 0;
    if (rows.length && status === "OK") {
      const stamped = rows.map((r) => ({
        county_fips: r.county_fips,
        external_apn: r.external_apn,
        parcel_id: apnToParcel.get(r.external_apn) ?? null,
        address: r.address,
        sold_at: r.sold_at,
        sale_price: r.sale_price,
        living_sqft: r.living_sqft,
        land_sqft: r.land_sqft,
        year_built: r.year_built,
        building_class: r.building_class,
        source_url: r.source_url,
        data_source: "LIVE",
      }));
      const CHUNK = 200;
      for (let i = 0; i < stamped.length; i += CHUNK) {
        const { error } = await supabase
          .from("sales")
          .upsert(stamped.slice(i, i + CHUNK), { onConflict: "county_fips,external_apn,sold_at,sale_price" });
        if (error) {
          status = "PARTIAL";
          note = `Upsert error: ${error.message}`;
          break;
        }
        inserted += Math.min(CHUNK, stamped.length - i);
      }
    }

    await supabase.from("ingestion_runs").insert({
      county_fips: b.fips, source: "SALES", status,
      rows_ingested: inserted, notes: note,
      started_at: started, finished_at: new Date().toISOString(),
    });

    const matched = Array.from(apnToParcel.values()).length;
    return { fips: b.fips, name: b.name, fetched: rows.length, inserted, matched_to_parcels: matched, status, note };
  });

export const ingestAllNycSales = createServerFn({ method: "POST" }).middleware([requireAdmin]).handler(async () => {
  // Citywide single fetch, then group by borough → county for reporting.
  const supabase = await adminClient();
  const { fetchNycSales } = await import("./adapters/nyc-sales");
  const started = new Date().toISOString();
  let rows: any[] = [];
  let note = "";
  let status: "OK" | "PARTIAL" | "FAIL" = "OK";
  try {
    rows = await fetchNycSales(null, 5000);
    note = `Fetched ${rows.length} NYC sales citywide`;
  } catch (e: any) {
    status = "FAIL"; note = `Upstream error: ${e.message}`;
  }

  // Ensure all 5 NYC counties exist so FK holds
  const { nycBoroughs } = await import("./adapters/nyc-sales");
  for (const b of nycBoroughs()) {
    await supabase.from("counties").upsert(
      { fips: b.fips, state: "NY", name: `NYC · ${b.name}`, center_lat: 40.7128, center_lng: -74.006 },
      { onConflict: "fips" },
    );
  }

  // Resolve external_apn → parcel_id across all NYC counties
  const apnToParcel = new Map<string, string>();
  if (rows.length) {
    const apns = Array.from(new Set(rows.map((r) => r.external_apn)));
    const CHUNK = 500;
    for (let i = 0; i < apns.length; i += CHUNK) {
      const { data: matches } = await supabase
        .from("parcels").select("id, apn, county_fips")
        .in("county_fips", Object.values({ MN: "36061", BX: "36005", BK: "36047", QN: "36081", SI: "36085" }))
        .in("apn", apns.slice(i, i + CHUNK));
      for (const m of matches ?? []) apnToParcel.set((m as any).apn, (m as any).id);
    }
  }

  const stamped = rows.map((r) => ({
    county_fips: r.county_fips,
    external_apn: r.external_apn,
    parcel_id: apnToParcel.get(r.external_apn) ?? null,
    address: r.address,
    sold_at: r.sold_at,
    sale_price: r.sale_price,
    living_sqft: r.living_sqft,
    land_sqft: r.land_sqft,
    year_built: r.year_built,
    building_class: r.building_class,
    source_url: r.source_url,
    data_source: "LIVE",
  }));

  // De-dupe on the upsert key so ON CONFLICT DO UPDATE doesn't hit the same row twice.
  const seen = new Set<string>();
  const deduped = stamped.filter((r) => {
    const k = `${r.county_fips}|${r.external_apn}|${r.sold_at}|${r.sale_price}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  let inserted = 0;
  if (deduped.length && status === "OK") {
    const CHUNK = 200;
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const { error } = await supabase.from("sales")
        .upsert(deduped.slice(i, i + CHUNK), { onConflict: "county_fips,external_apn,sold_at,sale_price" });
      if (error) { status = "PARTIAL"; note = `Upsert error: ${error.message}`; break; }
      inserted += Math.min(CHUNK, deduped.length - i);
    }
  }

  // Per-borough report
  const byBorough: Record<string, { fetched: number; inserted: number; name: string; fips: string; matched: number }> = {};
  for (const b of nycBoroughs()) byBorough[b.fips] = { fetched: 0, inserted: 0, name: b.name, fips: b.fips, matched: 0 };
  for (const r of rows) byBorough[r.county_fips]!.fetched++;
  for (const r of stamped) if (r.parcel_id) byBorough[r.county_fips]!.matched++;

  await supabase.from("ingestion_runs").insert({
    county_fips: "36061", source: "SALES", status,
    rows_ingested: inserted, notes: note,
    started_at: started, finished_at: new Date().toISOString(),
  });

  return Object.values(byBorough).map((b) => ({
    fips: b.fips, name: b.name, fetched: b.fetched, inserted: b.fetched,
    matched_to_parcels: b.matched, status, note,
  }));
});

export const salesSummary = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const supabase = await adminClient();
  const { count: total } = await supabase.from("sales").select("id", { count: "exact", head: true });
  const { data: byCounty } = await supabase.from("sales").select("county_fips");
  const counts: Record<string, number> = {};
  for (const r of byCounty ?? []) counts[r.county_fips] = (counts[r.county_fips] ?? 0) + 1;
  const { count: linked } = await supabase.from("sales").select("id", { count: "exact", head: true }).not("parcel_id", "is", null);
  return { total: total ?? 0, linked_to_parcels: linked ?? 0, by_county: counts };
});
