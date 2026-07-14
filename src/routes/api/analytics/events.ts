import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analytics/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const analytics = await import("@/lib/product-analytics.server");
        if (!analytics.requestIsSameOrigin(request)) {
          return Response.json({ ok: false, error: "Invalid origin" }, { status: 403 });
        }
        try {
          const body = await analytics.readAnalyticsBody(request);
          const input = analytics.productEventSchema.parse(body);
          if (!input.analytics_allowed) return Response.json({ ok: true, accepted: false });
          const accepted = await analytics.recordProductEvent(request, input);
          return Response.json(
            { ok: true, accepted },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const invalid = error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
          if (!invalid) console.error("[product-analytics] event ingestion failed", error);
          return Response.json(
            { ok: false, error: invalid ? "Invalid analytics event" : "Analytics unavailable" },
            { status: invalid ? 400 : 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
