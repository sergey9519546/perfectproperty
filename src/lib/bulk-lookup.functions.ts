/**
 * Bulk address lookup: enqueue N addresses, then a cron worker walks the
 * queue overnight and underwrites each one via `lookupParcelByAddress`.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function serverClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const RowSchema = z.object({
  address: z.string().min(3),
  state: z.string().length(2),
  city: z.string().optional(),
  county: z.string().optional(),
  unit: z.string().optional(),
});

const CreateInput = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  rows: z.array(RowSchema).min(1).max(2000),
});

/**
 * Enqueue a bulk job. Uses the service role so the client doesn't need
 * insert privileges on the queue tables.
 */
export const createBulkLookupJob = createServerFn({ method: "POST" })
  .validator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error: jErr } = await supabaseAdmin
      .from("bulk_lookup_jobs")
      .insert({ name: data.name ?? null, notes: data.notes ?? null, total: data.rows.length })
      .select("id")
      .single();
    if (jErr || !job) throw new Error(jErr?.message ?? "failed to create job");

    // De-dupe within the paste itself (case-insensitive on address+state)
    // so we don't send known-duplicate rows into the unique index.
    const seen = new Set<string>();
    const items: Array<{
      job_id: string; address: string; state: string;
      city: string | null; county: string | null; unit: string | null;
    }> = [];
    for (const r of data.rows) {
      const address = r.address.trim();
      const state = r.state.trim().toUpperCase();
      const key = `${address.toUpperCase()}|${state}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        job_id: job.id,
        address,
        state,
        city: r.city?.trim() || null,
        county: r.county?.trim() || null,
        unit: r.unit?.trim() || null,
      });
    }

    // Insert; the (job_id, upper(address), upper(state)) unique index will
    // reject any duplicates that slip past client-side de-dupe. Fall back to
    // per-row inserts on conflict so a single dupe doesn't fail the batch.
    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("bulk_lookup_items").insert(items).select("id");
    let enqueued = inserted?.length ?? 0;
    if (iErr) {
      if (!/duplicate key|unique constraint/i.test(iErr.message)) {
        throw new Error(iErr.message);
      }
      enqueued = 0;
      for (const it of items) {
        const { error: rowErr } = await supabaseAdmin.from("bulk_lookup_items").insert(it);
        if (!rowErr) enqueued++;
        else if (!/duplicate key|unique constraint/i.test(rowErr.message)) {
          throw new Error(rowErr.message);
        }
      }
    }

    // Keep the job's total in sync with what actually made it into the queue.
    if (enqueued !== data.rows.length) {
      await supabaseAdmin.from("bulk_lookup_jobs")
        .update({ total: enqueued }).eq("id", job.id);
    }
    return { job_id: job.id, enqueued, skipped: data.rows.length - enqueued };
  });

/**
 * List recent jobs with progress.
 */
export const listBulkLookupJobs = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverClient();
  const { data, error } = await supabase
    .from("bulk_lookup_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});

/**
 * Read a job + its items (paged).
 */
export const getBulkLookupJob = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ job_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = serverClient();
    const [job, items] = await Promise.all([
      supabase.from("bulk_lookup_jobs").select("*").eq("id", data.job_id).maybeSingle(),
      supabase.from("bulk_lookup_items").select("*").eq("job_id", data.job_id)
        .order("created_at", { ascending: true }).limit(2000),
    ]);
    if (job.error) throw new Error(job.error.message);
    return { job: job.data, items: items.data ?? [] };
  });

/**
 * Worker: process up to `limit` pending items across all jobs. Called by the
 * overnight cron endpoint. Serial rather than parallel so we don't hammer
 * Realie's rate limit; each address takes 2–4 s.
 */
export async function processBulkLookupBatch(limit = 20): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { lookupParcelByAddressCore } = await import("@/lib/parcels-core");

  const { data: pending, error } = await supabaseAdmin
    .from("bulk_lookup_items")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  let succeeded = 0;
  let failed = 0;
  const touched = new Set<string>();

  for (const item of pending ?? []) {
    touched.add(item.job_id);
    try {
      const r = await lookupParcelByAddressCore({
        address: item.address,
        state: item.state,
        city: item.city ?? undefined,
        county: item.county ?? undefined,
        unit: item.unit ?? undefined,
      });

      await supabaseAdmin.from("bulk_lookup_items").update({
        status: "succeeded",
        parcel_id: r.parcel_id,
        attempts: (item.attempts ?? 0) + 1,
        processed_at: new Date().toISOString(),
        error: null,
      }).eq("id", item.id);
      succeeded++;
    } catch (e: any) {
      await supabaseAdmin.from("bulk_lookup_items").update({
        status: "failed",
        attempts: (item.attempts ?? 0) + 1,
        processed_at: new Date().toISOString(),
        error: String(e?.message ?? e).slice(0, 500),
      }).eq("id", item.id);
      failed++;
    }
  }

  // Update job aggregates for each touched job.
  for (const jobId of touched) {
    const { data: counts } = await supabaseAdmin
      .from("bulk_lookup_items")
      .select("status")
      .eq("job_id", jobId);
    const total = counts?.length ?? 0;
    const done = (counts ?? []).filter((c) => c.status !== "pending").length;
    const okN = (counts ?? []).filter((c) => c.status === "succeeded").length;
    const failN = (counts ?? []).filter((c) => c.status === "failed").length;
    const finished = done === total;
    await supabaseAdmin.from("bulk_lookup_jobs").update({
      processed: done,
      succeeded: okN,
      failed: failN,
      status: finished ? "done" : "running",
      updated_at: new Date().toISOString(),
      finished_at: finished ? new Date().toISOString() : null,
    }).eq("id", jobId);
  }

  return { processed: (pending ?? []).length, succeeded, failed };
}

/**
 * Reset every failed item on a job back to `pending` so the overnight worker
 * picks them up on the next tick. Also nudges the worker to run one batch
 * immediately so the user sees movement without waiting for cron.
 *
 * `latest` (default) resolves to the most recently created job.
 */
const ResumeInput = z.object({ job_id: z.string().uuid().optional() });

export const resumeFailedInJob = createServerFn({ method: "POST" })
  .validator((data: unknown) => ResumeInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let jobId = data.job_id;
    if (!jobId) {
      const { data: latest } = await supabaseAdmin
        .from("bulk_lookup_jobs")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return { job_id: null, reset: 0, processed: 0, succeeded: 0, failed: 0 };
      jobId = latest.id;
    }

    const { data: reset, error } = await supabaseAdmin
      .from("bulk_lookup_items")
      .update({ status: "pending", error: null, processed_at: null, attempts: 0 })
      .eq("job_id", jobId)
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);


    const resetN = reset?.length ?? 0;

    // Reflect the reset on the parent job so the UI updates immediately.
    if (resetN > 0) {
      const { data: counts } = await supabaseAdmin
        .from("bulk_lookup_items").select("status").eq("job_id", jobId);
      const done = (counts ?? []).filter((c) => c.status !== "pending").length;
      const okN = (counts ?? []).filter((c) => c.status === "succeeded").length;
      const failN = (counts ?? []).filter((c) => c.status === "failed").length;
      await supabaseAdmin.from("bulk_lookup_jobs").update({
        status: done === (counts?.length ?? 0) ? "done" : "running",
        processed: done, succeeded: okN, failed: failN,
        finished_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    // Kick off one batch now so the user sees progress without waiting for cron.
    let processed = 0, succeeded = 0, failed = 0;
    if (resetN > 0) {
      const r = await processBulkLookupBatch(Math.min(resetN, 20));
      processed = r.processed; succeeded = r.succeeded; failed = r.failed;
    }
    return { job_id: jobId, reset: resetN, processed, succeeded, failed };
  });
