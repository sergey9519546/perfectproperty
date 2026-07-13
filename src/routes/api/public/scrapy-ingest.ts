/**
 * Signed ingest webhook for Scrapy Cloud spiders.
 *
 * Contract (POST):
 *   headers.x-signature = hex(HMAC-SHA256(SCRAPY_INGEST_SECRET, raw_body))
 *   body: {
 *     recipe: "foreclosure" | "probate" | "auction" | "code_violation" |
 *             "sale" | "parcel",
 *     items: [ { ...normalized fields... } ]
 *   }
 *
 * We verify the signature over the RAW request body (must read as text
 * BEFORE JSON.parse) with timingSafeEqual, then dispatch each recipe to a
 * validator + upsert against the right table. Every batch appends to
 * ingestion_runs with source = "SCRAPY:<recipe>".
 *
 * Unsigned / bad-signature requests get 401 with zero side effects.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const BodySchema = z.object({
  recipe: z.enum(["foreclosure", "probate", "auction", "code_violation", "sale", "parcel"]),
  items: z.array(z.record(z.string(), z.any())).min(1).max(2000),
  source_url: z.string().url().optional(),
});

function verifySignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

async function dispatch(recipe: string, items: any[], sourceUrl?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const started = new Date().toISOString();

  // distress_events requires parcel_id — for now we accept only rows that
  // already carry it OR ones we can look up by (county_fips, apn).
  let inserted = 0;
  let note = "";

  if (recipe === "foreclosure" || recipe === "probate" || recipe === "code_violation") {
    const eventType = recipe === "foreclosure" ? "FORECLOSURE"
      : recipe === "probate" ? "PROBATE" : "CODE_VIOLATION";
    // Resolve parcel_id when APN is provided.
    const rows: any[] = [];
    for (const it of items) {
      let parcelId = it.parcel_id ?? null;
      if (!parcelId && it.county_fips && it.apn) {
        const { data: p } = await supabaseAdmin.from("parcels")
          .select("id").eq("county_fips", it.county_fips).eq("apn", String(it.apn)).maybeSingle();
        parcelId = p?.id ?? null;
      }
      if (!parcelId) continue;
      rows.push({
        parcel_id: parcelId,
        event_type: it.event_type ?? eventType,
        severity: Number(it.severity ?? 3),
        amount: it.amount != null ? Number(it.amount) : null,
        event_date: it.event_date ?? started.slice(0, 10),
        auction_date: it.auction_date ?? null,
        details: { ...it, _source_url: sourceUrl ?? null },
        data_source: "SCRAPY",
      });
    }
    if (rows.length) {
      const { error } = await supabaseAdmin.from("distress_events").insert(rows);
      if (error) throw new Error(error.message);
      inserted = rows.length;
    }
    note = `matched ${inserted}/${items.length} to parcels`;
  } else if (recipe === "sale" || recipe === "auction") {
    const rows = items.map((it) => ({
      county_fips: String(it.county_fips ?? ""),
      apn: it.apn ? String(it.apn) : null,
      address: it.address ?? null,
      sold_at: it.sold_at ?? started.slice(0, 10),
      sale_price: it.sale_price != null ? Number(it.sale_price) : null,
      living_sqft: it.living_sqft != null ? Number(it.living_sqft) : null,
      lat: it.lat != null ? Number(it.lat) : null,
      lng: it.lng != null ? Number(it.lng) : null,
      buyer: it.buyer ?? null,
      seller: it.seller ?? null,
      data_source: "SCRAPY",
    })).filter((r) => r.county_fips && r.sale_price);
    if (rows.length) {
      const { error } = await supabaseAdmin.from("sales").insert(rows as any);
      if (error) throw new Error(error.message);
      inserted = rows.length;
    }
    note = `inserted ${inserted}/${items.length} sales`;
  } else if (recipe === "parcel") {
    // Parcels need county + apn to upsert cleanly.
    const rows = items.map((it) => ({
      apn: String(it.apn),
      county_fips: String(it.county_fips),
      address: it.address ?? "Address unknown",
      city: it.city ?? null, state: it.state ?? null, zip: it.zip ?? null,
      lat: it.lat != null ? Number(it.lat) : null,
      lng: it.lng != null ? Number(it.lng) : null,
      property_type: it.property_type ?? "SFR",
      year_built: it.year_built != null ? Number(it.year_built) : null,
      living_sqft: it.living_sqft != null ? Number(it.living_sqft) : null,
      lot_sqft: it.lot_sqft != null ? Number(it.lot_sqft) : null,
      owner_name: it.owner_name ?? null,
      assessed_value: it.assessed_value != null ? Number(it.assessed_value) : null,
      condition_grade: it.condition_grade ?? "B",
      flood_zone: it.flood_zone ?? "X",
      school_score: it.school_score ?? 6,
      data_source: "SCRAPY",
      source_url: sourceUrl ?? null,
      last_seen_at: started,
    })).filter((r) => r.apn && r.county_fips);
    if (rows.length) {
      const { data: upserted, error } = await supabaseAdmin.from("parcels")
        .upsert(rows as any, { onConflict: "county_fips,apn" })
        .select("id, county_fips, apn");
      if (error) throw new Error(error.message);
      inserted = rows.length;

      // Provenance: one entry per non-null field the spider provided.
      try {
        const { writeProvenance, DEFAULT_CONFIDENCE } = await import("@/lib/provenance.server");
        const idByKey = new Map(
          ((upserted ?? []) as any[]).map((u) => [`${u.county_fips}:${u.apn}`, u.id]),
        );
        const conf = DEFAULT_CONFIDENCE["SCRAPY:parcel"] ?? 0.7;
        const provFields = [
          "living_sqft", "year_built", "lot_sqft", "assessed_value",
          "owner_name", "property_type", "lat", "lng",
          "condition_grade", "flood_zone",
        ];
        for (const r of rows) {
          const pid = idByKey.get(`${r.county_fips}:${r.apn}`);
          if (!pid) continue;
          const entries = provFields
            .filter((f) => (r as any)[f] !== null && (r as any)[f] !== undefined)
            .map((f) => ({
              field: f as any,
              value: (r as any)[f],
              confidence: conf,
              source: "SCRAPY:parcel",
              observed_at: started,
            }));
          if (entries.length) await writeProvenance(pid, entries);
        }
      } catch (e) {
        console.warn("provenance write (scrapy parcel) failed:", (e as Error).message);
      }
    }
    note = `upserted ${inserted}/${items.length} parcels`;
  }

  await supabaseAdmin.from("ingestion_runs").insert({
    county_fips: "SCRAPY", source: `SCRAPY:${recipe}`, status: inserted > 0 ? "OK" : "PARTIAL",
    rows_ingested: inserted, notes: note,
    started_at: started, finished_at: new Date().toISOString(),
  });

  return { inserted, note };
}

export const Route = createFileRoute("/api/public/scrapy-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SCRAPY_INGEST_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const raw = await request.text();
        if (!verifySignature(secret, raw, request.headers.get("x-signature"))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let parsed;
        try { parsed = BodySchema.parse(JSON.parse(raw)); }
        catch (e: any) { return new Response(`Bad payload: ${e.message}`, { status: 400 }); }
        try {
          const res = await dispatch(parsed.recipe, parsed.items, parsed.source_url);
          return Response.json({ ok: true, ...res });
        } catch (e: any) {
          return new Response(`Ingest error: ${e.message}`, { status: 500 });
        }
      },
    },
  },
});
