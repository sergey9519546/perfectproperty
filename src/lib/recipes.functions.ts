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

    // For distress_events / sales / parcels we need to project extracted rows
    // to real table columns. Users won't get magic joins to parcels yet — we
    // stash the raw row in `details` (distress) or return it as preview only
    // for sales/parcels (which need a parcel FK we can't invent here).
    let inserted = 0;
    let status: "OK" | "PARTIAL" | "FAIL" = "OK";
    let note = `Extracted ${rows.length} rows from ${rec.source_url}`;

    if (rec.target_table === "distress_events") {
      // Distress needs a parcel_id — without APN matching, we can't insert
      // real rows yet. We store the raw payload as an ingestion note so the
      // user can see exactly what would land, and skip the write. A future
      // pass will fuzzy-match address → parcel_id.
      status = "PARTIAL";
      note = `Extracted ${rows.length} distress rows (preview only — address→parcel matcher not wired). First row: ${JSON.stringify(rows[0] ?? {}).slice(0, 400)}`;
    } else {
      status = "PARTIAL";
      note = `Extracted ${rows.length} ${rec.target_table} rows (preview only — target-table mapper not wired). First row: ${JSON.stringify(rows[0] ?? {}).slice(0, 400)}`;
    }

    await supabase.from("adapter_recipes").update({
      last_run_at: new Date().toISOString(), last_run_rows: rows.length,
    }).eq("id", rec.id);

    await supabase.from("ingestion_runs").insert({
      county_fips: "RECIPE", source: `RECIPE:${rec.name}`, status,
      rows_ingested: inserted, notes: note,
      started_at: started, finished_at: new Date().toISOString(),
    });

    return { ok: true, rows: rows.length, inserted, preview: rows.slice(0, 5), note };
  });
