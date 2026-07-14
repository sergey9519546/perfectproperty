import { describe, expect, it } from "vitest";
import { deviceClass } from "./product-analytics";
import {
  productEventSchema,
  requestIsSameOrigin,
  workflowActionSchema,
} from "./product-analytics.server";

const context = {
  client_event_id: "11111111-1111-4111-8111-111111111111",
  occurred_at: "2026-07-13T22:00:00.000Z",
  session_id: "22222222-2222-4222-8222-222222222222",
  anonymous_id: "33333333-3333-4333-8333-333333333333",
  route: "/workspace",
  device_class: "desktop" as const,
  reduced_motion: false,
  experiment_id: null,
  experiment_variant: null,
  analytics_allowed: true,
};

describe("product analytics contracts", () => {
  it("classifies device sizes at the UI breakpoints", () => {
    expect(deviceClass(375)).toBe("mobile");
    expect(deviceClass(768)).toBe("tablet");
    expect(deviceClass(1440)).toBe("desktop");
  });

  it("accepts a bounded client event", () => {
    const parsed = productEventSchema.parse({
      ...context,
      event_name: "market_selected",
      entity_type: "market",
      entity_id: "miami",
      properties: { source: "map", score: 93.1 },
    });
    expect(parsed.event_name).toBe("market_selected");
  });

  it("rejects client-forged success events", () => {
    expect(() => productEventSchema.parse({
      ...context,
      event_name: "underwrite_succeeded",
      properties: {},
    })).toThrow();
  });

  it("rejects evidence without a same-market five-second exposure", () => {
    expect(() => productEventSchema.parse({
      ...context,
      event_name: "evidence_viewed",
      entity_type: "market",
      entity_id: "miami",
      duration_ms: 4999,
      properties: {},
    })).toThrow();
    expect(() => productEventSchema.parse({
      ...context,
      event_name: "evidence_viewed",
      duration_ms: 5000,
      properties: {},
    })).toThrow();
  });

  it("accepts only supported server-confirmed workflow actions", () => {
    expect(workflowActionSchema.parse({
      ...context,
      action_type: "underwrite",
      market_id: "miami",
      market_name: "Miami, FL",
      input_snapshot: { score: 93.1 },
      properties: {},
    }).action_type).toBe("underwrite");
    expect(() => workflowActionSchema.parse({
      ...context,
      action_type: "delete_portfolio",
      market_id: "miami",
      market_name: "Miami, FL",
      input_snapshot: {},
      properties: {},
    })).toThrow();
  });

  it("allows same-origin requests and rejects cross-origin posts", () => {
    expect(requestIsSameOrigin(new Request("https://perfectproperty.example/api/analytics/events", {
      headers: { origin: "https://perfectproperty.example" },
    }))).toBe(true);
    expect(requestIsSameOrigin(new Request("https://perfectproperty.example/api/analytics/events", {
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
  });
});
