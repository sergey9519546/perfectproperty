import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_parcels",
  title: "Search parcels",
  description:
    "Search parcels by county, state, city, or owner name. Returns basic parcel identity + assessed value.",
  inputSchema: {
    state: z.string().length(2).optional().describe("Two-letter state code, e.g. 'CA' or 'FL'."),
    county: z.string().optional().describe("County name filter (case-insensitive contains)."),
    city: z.string().optional().describe("City filter (case-insensitive contains)."),
    owner: z.string().optional().describe("Owner name filter (case-insensitive contains)."),
    absentee_only: z.boolean().optional().describe("Restrict to absentee-owned parcels."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("parcels")
      .select("id, apn, address, city, county, state, owner_name, owner_is_absentee, assessed_value, estimated_equity")
      .limit(input.limit ?? 25);
    if (input.state) q = q.eq("state", input.state.toUpperCase());
    if (input.county) q = q.ilike("county", `%${input.county}%`);
    if (input.city) q = q.ilike("city", `%${input.city}%`);
    if (input.owner) q = q.ilike("owner_name", `%${input.owner}%`);
    if (input.absentee_only) q = q.eq("owner_is_absentee", true);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [], count: data?.length ?? 0 },
    };
  },
});
