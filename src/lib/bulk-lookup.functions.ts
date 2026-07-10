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
  .inputValidator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error: jErr } = await supabaseAdmin
      .from("bulk_lookup_jobs")
      .insert({ name: data.name ?? null, notes: data.notes ?? null, total: data.rows.length })
      .select("id")
      .single();
    if (jErr || !job) throw new Error(jErr?.message ?? "failed to create job");

    const items = data.rows.map((r) => ({
      job_id: job.id,
      address: r.address.trim(),
      state: r.state.trim().toUpperCase(),
      city: r.city?.trim() || null,
      county: r.county?.trim() || null,
      unit: r.unit?.trim() || null,
    }));
    const { error: iErr } = await supabaseAdmin.from("bulk_lookup_items").insert(items);
    if (iErr) throw new Error(iErr.message);
    return { job_id: job.id, enqueued: items.length };
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
  .inputValidator((data: unknown) => z.object({ job_id: z.string().uuid() }).parse(data))
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
  const { lookupParcelByAddress } = await import("@/lib/parcels.functions");

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
      const r = await lookupParcelByAddress({
        data: {
          address: item.address,
          state: item.state,
          city: item.city ?? undefined,
          county: item.county ?? undefined,
          unit: item.unit ?? undefined,
        },
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
