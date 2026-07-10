/**
 * Live-scraper server functions.
 *
 * `probeUrl` fetches any URL through the tiered fetcher (plain → Zyte),
 * parses it with cheerio, and caches the HTML + extracted text so repeat
 * calls are free. The admin UI uses this to preview what any county /
 * probate / auction page will yield BEFORE we wire a real adapter.
 *
 * `listProbes` returns the last N probe_runs for the admin timeline.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as cheerio from "cheerio";
import { requireAdmin } from "@/integrations/supabase/require-admin";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const ProbeInput = z.object({
  url: z.string().url(),
  tier: z.enum(["auto", "plain", "zyte", "browser"]).default("auto"),
  force: z.boolean().default(false),      // bypass cache
  ttl_hours: z.number().min(0).max(720).default(24),
});

export const probeUrl = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => ProbeInput.parse(d))
  .handler(async ({ data }) => {
    const supabase = await adminClient();
    const started = Date.now();

    // Cache hit?
    if (!data.force && data.ttl_hours > 0) {
      const { data: cached } = await supabase
        .from("probe_cache").select("*").eq("url", data.url).maybeSingle();
      if (cached) {
        const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 3.6e6;
        if (age < data.ttl_hours) {
          await supabase.from("probe_runs").insert({
            url: data.url, tier: cached.tier, status: "CACHED",
            http_status: cached.http_status, bytes: cached.bytes,
            duration_ms: 0, note: `cache hit (age ${age.toFixed(1)}h)`,
          });
          return summarize(cached);
        }
      }
    }

    const { probeFetch } = await import("./probe.server");
    const r = await probeFetch(data.url, data.tier);
    const duration = Date.now() - started;

    // Upsert cache (truncate html if huge — Postgres row limit ~1GB but we keep it sane).
    const htmlToStore = r.html.length > 800_000 ? r.html.slice(0, 800_000) : r.html;
    await supabase.from("probe_cache").upsert({
      url: data.url,
      tier: r.tier,
      http_status: r.http_status,
      final_url: r.final_url,
      content_type: r.content_type,
      bytes: r.bytes,
      title: r.title,
      text_preview: r.text.slice(0, 4000),
      html: htmlToStore,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "url" });

    await supabase.from("probe_runs").insert({
      url: data.url, tier: r.tier, status: r.status,
      http_status: r.http_status, bytes: r.bytes,
      duration_ms: duration, note: r.note,
    });

    // Extract structured hints (links, tables, headings) from the HTML so
    // the admin UI can immediately see what an adapter would work with.
    const hints = extractHints(r.html, r.final_url);

    return {
      tier: r.tier,
      status: r.status,
      http_status: r.http_status,
      final_url: r.final_url,
      bytes: r.bytes,
      title: r.title,
      text_preview: r.text.slice(0, 4000),
      note: r.note,
      duration_ms: duration,
      hints,
    };
  });

function summarize(cached: any) {
  const hints = extractHints(cached.html ?? "", cached.final_url ?? cached.url);
  return {
    tier: cached.tier,
    status: "CACHED",
    http_status: cached.http_status,
    final_url: cached.final_url ?? cached.url,
    bytes: cached.bytes,
    title: cached.title,
    text_preview: cached.text_preview ?? "",
    note: `cache hit`,
    duration_ms: 0,
    hints,
  };
}

function extractHints(html: string, baseUrl: string) {
  if (!html || html.length < 50) return { headings: [], links: [], tables: 0, forms: 0, dates: [], dollars: [] };
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();
  const headings = $("h1,h2,h3").slice(0, 20).map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const links: { text: string; href: string }[] = [];
  $("a[href]").each((_, el) => {
    if (links.length >= 40) return;
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      links.push({ text: text.slice(0, 120), href: abs });
    } catch { /* skip bad href */ }
  });
  const tables = $("table").length;
  const forms = $("form").length;
  const text = $("body").text();
  const dates = Array.from(text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)).slice(0, 8).map((m) => m[0]);
  const dollars = Array.from(text.matchAll(/\$\s?[\d,]+(?:\.\d{2})?/g)).slice(0, 8).map((m) => m[0]);
  return { headings, links, tables, forms, dates, dollars };
}

export const listProbes = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const supabase = await adminClient();
  const { data: runs } = await supabase.from("probe_runs")
    .select("*").order("started_at", { ascending: false }).limit(25);
  const { count: cached } = await supabase.from("probe_cache")
    .select("url", { count: "exact", head: true });
  return { runs: runs ?? [], cached: cached ?? 0, zyte_key_present: !!process.env.ZYTE_API_KEY };
});
