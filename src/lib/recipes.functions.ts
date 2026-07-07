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
    const { executeRecipeById } = await import("./recipes-runner.server");
    return executeRecipeById(data.id, data.max_rows);
  });


