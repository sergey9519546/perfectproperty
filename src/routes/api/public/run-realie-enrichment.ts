/**
 * Credit-bounded Realie enrichment worker.
 *
 * Claims up to 100 queue rows atomically, reuses full-response and negative
 * caches, groups nearby parcels into location searches, and falls back to an
 * exact lookup only for unmatched addresses. It never requests premium comps.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import type { RealieAuditEntry, RealieProperty } from "@/lib/adapters/realie";
import type { RealieBatchRequest } from "@/lib/realie-batch";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (!secret || !header) return false;
  const expected = Buffer.from(secret, "utf8");
  const received = Buffer.from(header.trim(), "utf8");
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

function isBudgetExhausted(error: unknown): boolean {
  return (
    (error as { code?: string } | null)?.code === "REALIE_BUDGET_EXHAUSTED" ||
    String((error as Error | null)?.message ?? error).includes("budget exhausted")
  );
}

type QueueItem = {
  parcel_id: string;
  reason: string;
  priority: number;
  attempts: number;
};

type WorkItem = RealieBatchRequest & {
  queue: QueueItem;
  county?: string;
};

type WorkResult = {
  parcel_id: string;
  status: "enriched" | "failed" | "deferred";
  note: string;
};

export const Route = createFileRoute("/api/public/run-realie-enrichment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { batch?: number };
        const requestedBatch = Number(body.batch ?? 25);
        const batch = Number.isFinite(requestedBatch)
          ? Math.min(100, Math.max(1, Math.floor(requestedBatch)))
          : 25;
        const startedAt = new Date().toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          cacheRealieMissCore,
          isRealieNegativeCachedCore,
          lookupParcelByAddressCore,
          persistRealiePropertyCore,
          readRealieSnapshotCore,
        } = await import("@/lib/parcels-core");
        const { realieLocationSearch, setRealieAuditSink } = await import("@/lib/adapters/realie");
        const { buildRealieLocationBatches, matchRealieProperties, realieLookupKey } =
          await import("@/lib/realie-batch");

        const { data: claimed, error: claimError } = await (supabaseAdmin as any).rpc(
          "claim_enrichment_queue",
          { p_limit: batch },
        );
        if (claimError)
          return new Response(`Queue claim failed: ${claimError.message}`, { status: 500 });
        const queueItems = (claimed ?? []) as QueueItem[];
        if (queueItems.length === 0) {
          return Response.json({ ok: true, processed: 0, enriched: 0, failed: 0, deferred: 0 });
        }

        const parcelIds = queueItems.map((item) => item.parcel_id);
        const { data: parcelRows, error: parcelError } = await supabaseAdmin
          .from("parcels")
          .select("id, apn, address, city, state, zip, county_fips, lat, lng")
          .in("id", parcelIds);
        if (parcelError)
          return new Response(`Parcel read failed: ${parcelError.message}`, { status: 500 });

        const fipsValues = [
          ...new Set((parcelRows ?? []).map((row) => row.county_fips).filter(Boolean)),
        ];
        const countyNames = new Map<string, string>();
        if (fipsValues.length > 0) {
          const { data: counties } = await supabaseAdmin
            .from("counties")
            .select("fips, name")
            .in("fips", fipsValues as string[]);
          for (const county of counties ?? []) countyNames.set(county.fips, county.name);
        }

        const queueByParcel = new Map(queueItems.map((item) => [item.parcel_id, item]));
        const work = (parcelRows ?? [])
          .filter((parcel) => parcel.address && parcel.state && queueByParcel.has(parcel.id))
          .map<WorkItem>((parcel) => ({
            parcel_id: parcel.id,
            apn: parcel.apn,
            address: parcel.address!,
            city: parcel.city,
            state: parcel.state,
            zip: parcel.zip,
            county_fips: parcel.county_fips,
            county: countyNames.get(parcel.county_fips),
            lat: parcel.lat,
            lng: parcel.lng,
            queue: queueByParcel.get(parcel.id)!,
          }));
        const workById = new Map(work.map((item) => [item.parcel_id, item]));
        const remaining = new Map(workById);
        const results: WorkResult[] = [];

        const markFailure = async (item: WorkItem, message: string) => {
          const attempts = item.queue.attempts + 1;
          const terminal = attempts >= 3;
          await supabaseAdmin
            .from("enrichment_queue")
            .update({
              status: terminal ? "failed" : "pending",
              attempts,
              started_at: null,
              last_error: message.slice(0, 500),
              completed_at: terminal ? new Date().toISOString() : null,
            })
            .eq("parcel_id", item.parcel_id);
          remaining.delete(item.parcel_id);
          results.push({ parcel_id: item.parcel_id, status: "failed", note: message });
        };

        const markEnriched = async (item: WorkItem) => {
          const { data: fresh } = await supabaseAdmin
            .from("parcels")
            .select("living_sqft, year_built")
            .eq("id", item.parcel_id)
            .maybeSingle();
          const missing = [
            !fresh?.living_sqft ? "living_sqft" : null,
            !fresh?.year_built ? "year_built" : null,
          ].filter(Boolean) as string[];
          if (missing.length > 0) {
            await markFailure(item, `insufficient: missing ${missing.join(",")}`);
            return;
          }
          await supabaseAdmin
            .from("enrichment_queue")
            .update({
              status: "done",
              attempts: item.queue.attempts + 1,
              started_at: null,
              last_error: null,
              completed_at: new Date().toISOString(),
            })
            .eq("parcel_id", item.parcel_id);
          remaining.delete(item.parcel_id);
          results.push({ parcel_id: item.parcel_id, status: "enriched", note: "enriched" });
        };

        const writeAuditEntries = async (
          entries: RealieAuditEntry[],
          context: { parcel_id?: string | null; county_fips?: string | null; outcome: string },
        ) => {
          if (entries.length === 0) return;
          await supabaseAdmin.from("realie_audit").insert(
            entries.map((entry) => ({
              parcel_id: context.parcel_id ?? null,
              county_fips: context.county_fips ?? null,
              endpoint: entry.endpoint,
              request_params: entry.params as any,
              http_status: entry.http_status,
              ok: entry.ok,
              duration_ms: entry.duration_ms,
              outcome: context.outcome,
              error_code: entry.error_code,
              error_message: entry.error_message,
              response_sample: entry.response_sample as any,
            })) as any,
          );
        };

        // Missing inputs cannot ever succeed through another paid attempt.
        for (const item of queueItems) {
          if (workById.has(item.parcel_id)) continue;
          await supabaseAdmin
            .from("enrichment_queue")
            .update({
              status: "failed",
              attempts: item.attempts + 1,
              started_at: null,
              last_error: "missing address or state",
              completed_at: new Date().toISOString(),
            })
            .eq("parcel_id", item.parcel_id);
          results.push({
            parcel_id: item.parcel_id,
            status: "failed",
            note: "missing address or state",
          });
        }

        // Reuse snapshots and suppress known misses before any metered request.
        for (const item of [...remaining.values()]) {
          const lookupKey = realieLookupKey(item);
          try {
            const snapshot = await readRealieSnapshotCore({
              parcelId: item.parcel_id,
              lookupKey,
            });
            if (snapshot) {
              await persistRealiePropertyCore(snapshot, {
                existingParcelId: item.parcel_id,
                fallbackState: item.state,
                county: item.county,
                endpoint: "cache",
                matchMethod: "snapshot",
                lookupKey,
                persistSnapshot: false,
              });
              await markEnriched(item);
              continue;
            }
            if (await isRealieNegativeCachedCore(lookupKey)) {
              await markFailure(item, "address not found in Realie (cached)");
            }
          } catch (error) {
            await markFailure(item, String((error as Error)?.message ?? error));
          }
        }

        let budgetExhausted = false;
        const locationBatches = buildRealieLocationBatches([...remaining.values()]);
        for (const locationBatch of locationBatches) {
          const batchItems = locationBatch.requests.filter((item) => remaining.has(item.parcel_id));
          if (batchItems.length < 2) continue;
          const captured: RealieAuditEntry[] = [];
          setRealieAuditSink((entry) => captured.push(entry));
          try {
            const properties = await realieLocationSearch({
              latitude: locationBatch.latitude,
              longitude: locationBatch.longitude,
              radius: locationBatch.radius,
              limit: 100,
              includeUnassignedAddress: false,
              residential: true,
              budgetClass: "background",
            });
            const matches = matchRealieProperties(batchItems, properties);
            await writeAuditEntries(captured, {
              parcel_id: null,
              county_fips:
                new Set(batchItems.map((item) => item.county_fips).filter(Boolean)).size === 1
                  ? batchItems[0].county_fips
                  : null,
              outcome: `batch_location_${matches.size}_of_${batchItems.length}`,
            });
            for (const item of batchItems) {
              const property = matches.get(item.parcel_id) as RealieProperty | undefined;
              if (!property) continue;
              try {
                await persistRealiePropertyCore(property, {
                  existingParcelId: item.parcel_id,
                  fallbackState: item.state,
                  county: item.county,
                  endpoint: "/public/property/location/",
                  matchMethod: "location_exact_match",
                  lookupKey: realieLookupKey(item),
                });
                await markEnriched(item);
              } catch (error) {
                await markFailure(item, String((error as Error)?.message ?? error));
              }
            }
          } catch (error) {
            await writeAuditEntries(captured, {
              parcel_id: null,
              county_fips: null,
              outcome: "batch_location_error",
            });
            if (isBudgetExhausted(error)) {
              budgetExhausted = true;
              break;
            }
            const message = String((error as Error)?.message ?? error);
            for (const item of batchItems) await markFailure(item, message);
          } finally {
            setRealieAuditSink(null);
          }
        }

        // Exact fallback is required for singletons and location results that
        // did not contain an exact APN/address match.
        if (!budgetExhausted) {
          for (const item of [...remaining.values()]) {
            const captured: RealieAuditEntry[] = [];
            setRealieAuditSink((entry) => captured.push(entry));
            try {
              await lookupParcelByAddressCore({
                address: item.address,
                state: item.state,
                city: item.county ? (item.city ?? undefined) : undefined,
                county: item.county,
                existingParcelId: item.parcel_id,
                underwrite: false,
                budgetClass: "background",
              });
              await writeAuditEntries(captured, {
                parcel_id: item.parcel_id,
                county_fips: item.county_fips,
                outcome: "exact_lookup",
              });
              await markEnriched(item);
            } catch (error) {
              await writeAuditEntries(captured, {
                parcel_id: item.parcel_id,
                county_fips: item.county_fips,
                outcome: "exact_lookup_error",
              });
              if (isBudgetExhausted(error)) {
                budgetExhausted = true;
                break;
              }
              if (String((error as Error)?.message ?? error).match(/not found/i)) {
                await cacheRealieMissCore(
                  realieLookupKey(item),
                  "address_not_found",
                  404,
                  item.city && !item.county
                    ? "/public/property/search/"
                    : "/public/property/address/",
                );
              }
              await markFailure(item, String((error as Error)?.message ?? error));
            } finally {
              setRealieAuditSink(null);
            }
          }
        }

        // A daily cap is normal flow. Return untouched claims to pending and do
        // not consume their retry allowance.
        if (budgetExhausted && remaining.size > 0) {
          const deferredIds = [...remaining.keys()];
          await supabaseAdmin
            .from("enrichment_queue")
            .update({
              status: "pending",
              started_at: null,
              completed_at: null,
              last_error: "Realie background budget exhausted",
            })
            .in("parcel_id", deferredIds);
          for (const parcelId of deferredIds) {
            results.push({
              parcel_id: parcelId,
              status: "deferred",
              note: "daily budget exhausted",
            });
          }
          remaining.clear();
        }

        const enriched = results.filter((result) => result.status === "enriched").length;
        const failed = results.filter((result) => result.status === "failed").length;
        const deferred = results.filter((result) => result.status === "deferred").length;

        const countySummary = new Map<string, { ok: number; fail: number; deferred: number }>();
        for (const result of results) {
          const fips = workById.get(result.parcel_id)?.county_fips;
          if (!fips) continue;
          const summary = countySummary.get(fips) ?? { ok: 0, fail: 0, deferred: 0 };
          if (result.status === "enriched") summary.ok++;
          else if (result.status === "failed") summary.fail++;
          else summary.deferred++;
          countySummary.set(fips, summary);
        }
        for (const [countyFips, summary] of countySummary) {
          await supabaseAdmin.from("ingestion_runs").insert({
            county_fips: countyFips,
            source: "REALIE:enrichment",
            status:
              summary.fail === 0 && summary.deferred === 0
                ? "OK"
                : summary.ok > 0
                  ? "PARTIAL"
                  : summary.deferred > 0 && summary.fail === 0
                    ? "DEFERRED"
                    : "FAIL",
            rows_ingested: summary.ok,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            notes: `enriched ${summary.ok} / failed ${summary.fail} / deferred ${summary.deferred}`,
          } as any);
        }

        // Score once after the complete batch. No per-parcel premium-comps
        // calls occur in this worker.
        let rescored = 0;
        let monitoringRefreshed = false;
        if (enriched > 0) {
          try {
            const { scoreAllCore } = await import("@/lib/ingest-core");
            const scoreResult = await scoreAllCore();
            rescored = scoreResult.scored ?? 0;
          } catch (error) {
            console.error("post-enrichment scoreAll failed:", (error as Error).message);
          }
          try {
            const response = await fetch(
              `${new URL(request.url).origin}/api/public/run-monitoring`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-cron-secret": process.env.CRON_SECRET!,
                },
                body: "{}",
              },
            );
            monitoringRefreshed = response.ok;
          } catch (error) {
            console.error("post-enrichment monitoring refresh failed:", (error as Error).message);
          }
        }

        return Response.json({
          ok: failed === 0,
          processed: results.length,
          enriched,
          failed,
          deferred,
          rescored,
          monitoring_refreshed: monitoringRefreshed,
          results,
        });
      },
    },
  },
});
