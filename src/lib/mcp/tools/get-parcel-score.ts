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
  name: "get_parcel_score",
  title: "Get parcel underwriting score",
  description:
    "Return the latest underwriting score for a parcel: ARV, offer, projected profit, risk metrics.",
  inputSchema: {
    parcel_id: z.string().uuid().describe("Parcel UUID from search_parcels."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ parcel_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = sb(ctx);
    const [parcel, score] = await Promise.all([
      client.from("parcels").select("*").eq("id", parcel_id).maybeSingle(),
      client
        .from("parcel_scores")
        .select("*")
        .eq("parcel_id", parcel_id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (parcel.error) return { content: [{ type: "text", text: parcel.error.message }], isError: true };
    if (!parcel.data) return { content: [{ type: "text", text: "Parcel not found" }], isError: true };
    const payload = { parcel: parcel.data, latest_score: score.data ?? null };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
