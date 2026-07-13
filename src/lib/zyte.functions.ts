/**
 * Admin-only server functions exposing Zyte state to the UI.
 * Import zyte.server.ts inside handlers only (server-only enforcement).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/require-admin";

export const getZyteStatus = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { zyteEnabled, zyteProjectId, scrapyCloudListJobs } = await import("./zyte.server");
    if (!zyteEnabled()) {
      return { enabled: false, project: null as string | null, jobs: [], error: null as string | null };
    }
    try {
      const jobs = await scrapyCloudListJobs(15);
      return { enabled: true, project: zyteProjectId(), jobs, error: null };
    } catch (e: any) {
      return { enabled: true, project: zyteProjectId(), jobs: [], error: String(e?.message ?? e) };
    }
  });

export const scheduleZyteJob = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: { spider: string; recipe?: string }) =>
    z.object({ spider: z.string().min(1), recipe: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { scrapyCloudSchedule } = await import("./zyte.server");
    return scrapyCloudSchedule({ spider: data.spider, recipe: data.recipe });
  });
