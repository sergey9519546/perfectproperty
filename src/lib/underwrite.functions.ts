/**
 * Per-deal underwrite server function. Wraps `rerunUnderwriteCore` so
 * cron/background workers can share the same code path without going
 * through an HTTP handler.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rerunUnderwriteCore } from "@/lib/underwrite-core";

const Input = z.object({ parcel_id: z.string().uuid() });

export const rerunUnderwrite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => rerunUnderwriteCore(data.parcel_id));
