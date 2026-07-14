import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analytics/actions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const analytics = await import("@/lib/product-analytics.server");
        if (!analytics.requestIsSameOrigin(request)) {
          return Response.json({ ok: false, error: "Invalid origin" }, { status: 403 });
        }
        try {
          const body = await analytics.readAnalyticsBody(request);
          const input = analytics.workflowActionSchema.parse(body);
          const actionId = await analytics.recordWorkflowAction(request, input);
          return Response.json(
            { ok: true, action_id: actionId },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const invalid = error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
          if (!invalid) console.error("[product-analytics] workflow action failed", error);
          return Response.json(
            { ok: false, error: invalid ? "Invalid workflow action" : "Action unavailable" },
            { status: invalid ? 400 : 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
