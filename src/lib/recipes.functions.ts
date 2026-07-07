/**
 * Recipe wizard server functions.
 *
 *   discoverSchema(url)         → cheerio-detects repeating containers,
 *                                 returns ranked candidate schemas.
 *   saveRecipe(...)             → upsert into adapter_recipes.
 *   listRecipes()               → for the admin panel.
 *   runRecipe({ id })           → re-fetch through the probe backbone,
 *                                 apply the recipe, upsert normalized rows
 *                                 into the recipe's target table.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const discoverSchema = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await adminClient();
    // Prefer cached HTML — the user just probed the URL.
    const { data: cached } = await supabase
      .from("probe_cache").select("html, final_url, fetched_at").eq("url", data.url).maybeSingle();
    let html = cached?.html ?? "";
    let base = cached?.final_url ?? data.url;
    if (!html) {
      const { probeFetch } = await import("./probe.server");
      const r = await probeFetch(data.url, "auto");
      html = r.html; base = r.final_url;
    }
    const { discoverCandidates } = await import("./discovery.server");
    const candidates = discoverCandidates(html);
    return { base_url: base, candidates };
  });

const FieldSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1),
  type: z.enum(["text", "date", "money", "url", "number"]),
});
const RecipeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  target_table: z.enum(["distress_events", "sales", "parcels"]),
  source_url: z.string().url(),
  url_pattern: z.string().nullable().optional(),
  container_selector: z.string().min(1),
  fields: z.array(FieldSchema).min(1).max(30),
  notes: z.string().nullable().optional(),
});

export const saveRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RecipeSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = await adminClient();
    const row = {
      ...data,
      fields: data.fields as any,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase.from("adapter_recipes")
        .update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabase.from("adapter_recipes")
      .insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const listRecipes = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await adminClient();
  const { data } = await supabase.from("adapter_recipes")
    .select("*").order("updated_at", { ascending: false });
  return data ?? [];
});

export const deleteRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await adminClient();
    await supabase.from("adapter_recipes").delete().eq("id", data.id);
    return { ok: true };
  });

export const runRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), max_rows: z.number().min(1).max(2000).default(500) }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await adminClient();
    const started = new Date().toISOString();
    const { data: rec, error } = await supabase.from("adapter_recipes")
      .select("*").eq("id", data.id).single();
    if (error || !rec) throw new Error("Recipe not found");

    const { probeFetch } = await import("./probe.server");
    const r = await probeFetch(rec.source_url, "auto");
    if (r.status === "FAIL" || !r.html) {
      await supabase.from("ingestion_runs").insert({
        county_fips: "RECIPE", source: `RECIPE:${rec.name}`, status: "FAIL",
        rows_ingested: 0, notes: `Fetch failed: ${r.note}`,
        started_at: started, finished_at: new Date().toISOString(),
      });
      return { ok: false, rows: 0, note: r.note };
    }

    const { applyRecipe } = await import("./discovery.server");
    const rows = applyRecipe(r.html, {
      container_selector: rec.container_selector,
      fields: rec.fields as any,
      base_url: r.final_url,
    }).slice(0, data.max_rows);

    // Route extracted rows to the target table. distress_events uses the
    // match_parcel_debug() DB function to fuzzy-join scraped address → parcel_id
    // AND report which strategy hit (apn_county / addr_county / addr_city).
    let inserted = 0;
    let unmatched = 0;
    let status: "OK" | "PARTIAL" | "FAIL" = "OK";
    let note = `Extracted ${rows.length} rows from ${rec.source_url}`;
    const matchBreakdown: Record<"apn_county" | "addr_county" | "addr_city", number> =
      { apn_county: 0, addr_county: 0, addr_city: 0 };
    const unmatchedReasons: Record<string, number> = {};
    const unmatchedSamples: Array<{ address: string | null; apn: string | null; city: string | null; reason: string }> = [];
    function bumpReason(reason: string, sample: { address: any; apn: any; city: any }) {
      unmatchedReasons[reason] = (unmatchedReasons[reason] ?? 0) + 1;
      if (unmatchedSamples.length < 5) {
        unmatchedSamples.push({
          address: sample.address ? String(sample.address) : null,
          apn: sample.apn ? String(sample.apn) : null,
          city: sample.city ? String(sample.city) : null,
          reason,
        });
      }
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
        if (!address && !apn) {
          bumpReason("no_address_or_apn", { address, apn, city });
          unmatched++; continue;
        }
        const { data: debugRows } = await (supabase as any).rpc("match_parcel_debug", {
          _county_fips: countyFips, _apn: apn ? String(apn) : null,
          _address: address ? String(address) : null, _city: city ? String(city) : null,
        });
        const hit = Array.isArray(debugRows) ? debugRows[0] : null;
        const pid: string | null = hit?.parcel_id ?? null;
        const method: string | null = hit?.method ?? null;
        if (!pid) {
          const reason = !countyFips && !city ? "no_county_or_city_scope"
            : !address ? "apn_not_found_in_county"
            : "address_not_found";
          bumpReason(reason, { address, apn, city });
          unmatched++; continue;
        }
        if (method === "apn_county" || method === "addr_county" || method === "addr_city") {
          matchBreakdown[method]++;
        }
        toInsert.push({
          parcel_id: pid,
          event_type: eventType,
          severity: 3,
          amount: pick(row, "amount", "price", "balance") ?? null,
          event_date: pick(row, "date", "filing_date", "event_date") ?? started.slice(0, 10),
          auction_date: pick(row, "auction_date", "sale_date") ?? null,
          details: { ...row, _match_method: method },
          data_source: "RECIPE",
        });
      }
      if (toInsert.length) {
        const { error: ie } = await supabase.from("distress_events").insert(toInsert);
        if (ie) { status = "FAIL"; note = `Insert failed: ${ie.message}`; }
        else { inserted = toInsert.length; }
      }
      status = inserted > 0 ? (unmatched > 0 ? "PARTIAL" : "OK") : "PARTIAL";
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
        const { error: ie } = await supabase.from("sales").insert(toInsert as any);
        if (ie) { status = "FAIL"; note = `Insert failed: ${ie.message}`; }
        else { inserted = toInsert.length; }
      }
      status = inserted > 0 ? "OK" : "PARTIAL";
      note = `Extracted ${rows.length} · inserted ${inserted} sales · skipped ${rows.length - inserted} (missing price)`;
    } else {
      status = "PARTIAL";
      note = `Extracted ${rows.length} rows (parcels target requires county_fips + apn in the recipe fields). Sample: ${JSON.stringify(rows[0] ?? {}).slice(0, 300)}`;
    }

    await supabase.from("adapter_recipes").update({
      last_run_at: new Date().toISOString(), last_run_rows: rows.length,
    }).eq("id", rec.id);

    await supabase.from("ingestion_runs").insert({
      county_fips: "RECIPE", source: `RECIPE:${rec.name}`, status,
      rows_ingested: inserted, notes: note,
      started_at: started, finished_at: new Date().toISOString(),
    });

    return {
      ok: true,
      rows: rows.length,
      inserted,
      unmatched,
      preview: rows.slice(0, 5),
      note,
      target_table: rec.target_table,
      match_breakdown: matchBreakdown,
      unmatched_reasons: unmatchedReasons,
      unmatched_samples: unmatchedSamples,
    };
  });

