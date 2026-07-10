/**
 * Admin server functions for the ingestion pipeline. Business logic lives
 * in `src/lib/ingest-core.ts` so cron endpoints can share the same code path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COUNTY_SOURCES } from "./adapters/sources";
import { requireAdmin } from "@/integrations/supabase/require-admin";
import { ingestCountyCore, scoreAllCore } from "./ingest-core";

const RunInput = z.object({
  county_fips: z.string(),
  max_parcels: z.number().int().min(1).max(50000).default(5000),
  enrich_flood: z.boolean().default(true),
});

export const ingestCounty = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data }) => ingestCountyCore(data));

export const scoreAll = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => scoreAllCore());

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    return COUNTY_SOURCES.map((s) => ({
      fips: s.fips, state: s.state, name: s.name,
      parcels: s.parcels ? { kind: s.parcels.kind, url: s.parcels.url } : null,
      distress: s.distress ?? null,
    }));
  });
