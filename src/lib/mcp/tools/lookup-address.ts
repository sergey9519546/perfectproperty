import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { lookupParcelByAddressCore } from "@/lib/parcels-core";

export default defineTool({
  name: "lookup_parcel_by_address",
  title: "Look up parcel by address",
  description:
    "Resolve a street address to a parcel record via the ingestion pipeline. Returns parcel + latest score.",
  inputSchema: {
    address: z.string().min(3).describe("Street address, e.g. '123 Main St'."),
    state: z.string().length(2).describe("Two-letter state code, required."),
    city: z.string().optional(),
    county: z.string().optional(),
    unit: z.string().optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    try {
      const result = await lookupParcelByAddressCore({
        ...input,
        underwrite: true,
        budgetClass: "interactive",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: msg }], isError: true };
    }
  },
});
