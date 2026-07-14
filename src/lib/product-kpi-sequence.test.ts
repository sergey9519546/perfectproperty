import { describe, expect, it } from "vitest";
import { evaluateProductJourney, type JourneyEvent } from "./product-kpi-sequence";

const minute = 60_000;
const base: JourneyEvent[] = [
  { eventName: "landing_view", occurredAt: 0 },
  { eventName: "workspace_opened", occurredAt: minute },
];

describe("qualified product journey", () => {
  it("qualifies an ordered, same-market journey", () => {
    const result = evaluateProductJourney([
      ...base,
      { eventName: "market_selected", occurredAt: 2 * minute, entityId: "miami" },
      { eventName: "evidence_viewed", occurredAt: 3 * minute, entityId: "miami" },
      { eventName: "underwrite_succeeded", occurredAt: 4 * minute, entityId: "miami" },
    ]);
    expect(result).toEqual({ qualified: true, matchedEvidenceAction: true, qualifiedAt: 4 * minute });
  });

  it("rejects timestamps assembled from different markets", () => {
    const result = evaluateProductJourney([
      ...base,
      { eventName: "market_selected", occurredAt: 2 * minute, entityId: "miami" },
      { eventName: "evidence_viewed", occurredAt: 3 * minute, entityId: "tampa" },
      { eventName: "brief_export_succeeded", occurredAt: 4 * minute, entityId: "miami" },
    ]);
    expect(result.qualified).toBe(false);
    expect(result.matchedEvidenceAction).toBe(false);
  });

  it("rejects evidence recorded before the deliberate selection", () => {
    const result = evaluateProductJourney([
      ...base,
      { eventName: "evidence_viewed", occurredAt: 2 * minute, entityId: "miami" },
      { eventName: "market_selected", occurredAt: 3 * minute, entityId: "miami" },
      { eventName: "underwrite_succeeded", occurredAt: 4 * minute, entityId: "miami" },
    ]);
    expect(result.qualified).toBe(false);
  });

  it("keeps a same-market action visible but outside the activation window", () => {
    const result = evaluateProductJourney([
      ...base,
      { eventName: "market_selected", occurredAt: 2 * minute, entityId: "miami" },
      { eventName: "evidence_viewed", occurredAt: 3 * minute, entityId: "miami" },
      { eventName: "underwrite_succeeded", occurredAt: 32 * minute, entityId: "miami" },
    ]);
    expect(result.qualified).toBe(false);
    expect(result.matchedEvidenceAction).toBe(true);
  });
});
