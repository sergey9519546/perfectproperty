/**
 * Shared recipe execution — used by:
 *   - runRecipe() server fn (admin-triggered one-off)
 *   - /api/public/run-recipes cron endpoint (pg_cron every 6h)
 *
 * All writes go through the supabaseAdmin client; every run appends one row
 * to ingestion_runs.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface RunReport {
  ok: boolean;
  recipe_id: string;
  recipe_name: string;
  rows: number;
  inserted: number;
  unmatched: number;
  note: string;
  target_table: string;
  match_breakdown: { apn_county: number; addr_county: number; addr_city: number };
  unmatched_reasons: Record<string, number>;
  unmatched_samples: Array<{ address: string | null; apn: string | null; city: string | null; reason: string }>;
  preview: any[];
}

function pick(row: any, ...keys: string[]): any {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === k.toLowerCase() || rk.toLowerCase().includes(k.toLowerCase())) {
        const v = row[rk];
        if (v != null && v !== "") return v;
      }
    }
  }
  return null;
}

export async function executeRecipeById(recipeId: string, maxRows = 500): Promise<RunReport> {
  const started = new Date().toISOString();
  const { data: rec, error } = await supabaseAdmin.from("adapter_recipes")
    .select("*").eq("id", recipeId).single();
  if (error || !rec) throw new Error("Recipe not found");

  const empty: RunReport = {
    ok: false, recipe_id: recipeId, recipe_name: rec.name, rows: 0, inserted: 0,
    unmatched: 0, note: "", target_table: rec.target_table,
    match_breakdown: { apn_county: 0, addr_county: 0, addr_city: 0 },
    unmatched_reasons: {}, unmatched_samples: [], preview: [],
  };

  const { probeFetch } = await import("./probe.server");
  const r = await probeFetch(rec.source_url, "auto");
  if (r.status === "FAIL" || !r.html) {
    await supabaseAdmin.from("ingestion_runs").insert({
      county_fips: "RECIPE", source: `RECIPE:${rec.name}`, status: "FAIL",
      rows_ingested: 0, notes: `Fetch failed: ${r.note}`,
      started_at: started, finished_at: new Date().toISOString(),
    });
    return { ...empty, note: r.note ?? "fetch failed" };
  }

  const { applyRecipe } = await import("./discovery.server");
  const rows = applyRecipe(r.html, {
    container_selector: rec.container_selector,
    fields: rec.fields as any,
    base_url: r.final_url,
  }).slice(0, maxRows);

  let inserted = 0;
  let unmatched = 0;
  let status: "OK" | "PARTIAL" | "FAIL" = "OK";
  let note = `Extracted ${rows.length} rows from ${rec.source_url}`;
  const matchBreakdown = { apn_county: 0, addr_county: 0, addr_city: 0 };
  const unmatchedReasons: Record<string, number> = {};
  const unmatchedSamples: RunReport["unmatched_samples"] = [];
  const bumpReason = (reason: string, s: { address: any; apn: any; city: any }) => {
    unmatchedReasons[reason] = (unmatchedReasons[reason] ?? 0) + 1;
    if (unmatchedSamples.length < 5) {
      unmatchedSamples.push({
        address: s.address ? String(s.address) : null,
        apn: s.apn ? String(s.apn) : null,
        city: s.city ? String(s.city) : null,
        reason,
      });
    }
  };

  if (rec.target_table === "distress_events") {
    const eventType = rec.name.toLowerCase().includes("probate") ? "PROBATE"
      : rec.name.toLowerCase().includes("code") ? "CODE_VIOLATION"
      : rec.name.toLowerCase().includes("tax") ? "TAX_LIEN"
      : "FORECLOSURE";
    const toInsert: any[] = [];
    for (const row of rows) {
      const address = pick(row, "address", "property_address", "situs");
      const apn = pick(row, "apn", "parcel", "folio", "pin");
      const city = pick(row, "city", "municipality");
      const countyFips = pick(row, "county_fips") ?? null;
      if (!address && !apn) { bumpReason("no_address_or_apn", { address, apn, city }); unmatched++; continue; }
      const { data: debugRows } = await (supabaseAdmin as any).rpc("match_parcel_debug", {
        _county_fips: countyFips, _apn: apn ? String(apn) : null,
        _address: address ? String(address) : null, _city: city ? String(city) : null,
      });
      const hit = Array.isArray(debugRows) ? debugRows[0] : null;
      const pid: string | null = hit?.parcel_id ?? null;
      const method: string | null = hit?.method ?? null;
      if (!pid) {
        const reason = !countyFips && !city ? "no_county_or_city_scope"
          : !address ? "apn_not_found_in_county" : "address_not_found";
        bumpReason(reason, { address, apn, city });
        unmatched++; continue;
      }
      if (method === "apn_county" || method === "addr_county" || method === "addr_city") {
        matchBreakdown[method]++;
      }
      toInsert.push({
        parcel_id: pid, event_type: eventType, severity: 3,
        amount: pick(row, "amount", "price", "balance") ?? null,
        event_date: pick(row, "date", "filing_date", "event_date") ?? started.slice(0, 10),
        auction_date: pick(row, "auction_date", "sale_date") ?? null,
        details: { ...row, _match_method: method },
        data_source: "RECIPE",
      });
    }
    if (toInsert.length) {
      const { error: ie } = await supabaseAdmin.from("distress_events").insert(toInsert);
      if (ie) { status = "FAIL"; note = `Insert failed: ${ie.message}`; }
      else { inserted = toInsert.length; }
    }
    if (status !== "FAIL") status = inserted > 0 ? (unmatched > 0 ? "PARTIAL" : "OK") : "PARTIAL";
    const conf = `APN+county ${matchBreakdown.apn_county} · addr+county ${matchBreakdown.addr_county} · addr+city ${matchBreakdown.addr_city}`;
    note = `Extracted ${rows.length} · matched ${inserted} (${conf}) · unmatched ${unmatched}`;
  } else if (rec.target_table === "sales") {
    const toInsert = rows.map((row) => ({
      county_fips: String(pick(row, "county_fips") ?? "UNKNOWN"),
      apn: pick(row, "apn", "parcel", "folio") ? String(pick(row, "apn", "parcel", "folio")) : null,
      address: pick(row, "address"),
      sold_at: pick(row, "sold_at", "sale_date", "date") ?? started.slice(0, 10),
      sale_price: pick(row, "sale_price", "price", "amount"),
      living_sqft: pick(row, "living_sqft", "sqft"),
      buyer: pick(row, "buyer"), seller: pick(row, "seller"),
      data_source: "RECIPE",
    })).filter((r) => r.sale_price != null);
    if (toInsert.length) {
      const { error: ie } = await supabaseAdmin.from("sales").insert(toInsert as any);
      if (ie) { status = "FAIL"; note = `Insert failed: ${ie.message}`; }
      else { inserted = toInsert.length; }
    }
    if (status !== "FAIL") status = inserted > 0 ? "OK" : "PARTIAL";
    note = `Extracted ${rows.length} · inserted ${inserted} sales · skipped ${rows.length - inserted} (missing price)`;
  } else {
    status = "PARTIAL";
    note = `Extracted ${rows.length} rows (parcels target requires county_fips + apn). Sample: ${JSON.stringify(rows[0] ?? {}).slice(0, 300)}`;
  }

  await supabaseAdmin.from("adapter_recipes").update({
    last_run_at: new Date().toISOString(), last_run_rows: rows.length,
  }).eq("id", rec.id);

  await supabaseAdmin.from("ingestion_runs").insert({
    county_fips: "RECIPE", source: `RECIPE:${rec.name}`, status,
    rows_ingested: inserted, notes: note,
    started_at: started, finished_at: new Date().toISOString(),
  });

  return {
    ok: status !== "FAIL",
    recipe_id: rec.id, recipe_name: rec.name,
    rows: rows.length, inserted, unmatched, note,
    target_table: rec.target_table,
    match_breakdown: matchBreakdown,
    unmatched_reasons: unmatchedReasons,
    unmatched_samples: unmatchedSamples,
    preview: rows.slice(0, 5),
  };
}
