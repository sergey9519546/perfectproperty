type JourneyEventName =
  | "landing_view"
  | "workspace_opened"
  | "market_selected"
  | "evidence_viewed"
  | "underwrite_succeeded"
  | "brief_export_succeeded";

export type JourneyEvent = {
  eventName: JourneyEventName;
  occurredAt: number;
  entityId?: string;
};

export type JourneyEvaluation = {
  qualified: boolean;
  matchedEvidenceAction: boolean;
  qualifiedAt: number | null;
};

/** Reference implementation of the SQL funnel contract used by regression tests. */
export function evaluateProductJourney(
  input: JourneyEvent[],
  activationWindowMs = 30 * 60 * 1000,
): JourneyEvaluation {
  const events = [...input].sort((a, b) => a.occurredAt - b.occurredAt);
  const landing = events.find((event) => event.eventName === "landing_view");
  const workspace = events.find(
    (event) => event.eventName === "workspace_opened" && (!landing || event.occurredAt >= landing.occurredAt),
  );
  let matchedEvidenceAction = false;
  let qualifiedAt: number | null = null;

  if (!landing || !workspace) return { qualified: false, matchedEvidenceAction, qualifiedAt };

  for (const market of events) {
    if (
      market.eventName !== "market_selected" ||
      !market.entityId ||
      market.occurredAt < workspace.occurredAt
    ) continue;

    const evidence = events.find(
      (event) =>
        event.eventName === "evidence_viewed" &&
        event.entityId === market.entityId &&
        event.occurredAt >= market.occurredAt,
    );
    if (!evidence) continue;

    const action = events.find(
      (event) =>
        (event.eventName === "underwrite_succeeded" || event.eventName === "brief_export_succeeded") &&
        event.entityId === market.entityId &&
        event.occurredAt >= evidence.occurredAt,
    );
    if (!action) continue;
    matchedEvidenceAction = true;
    if (action.occurredAt <= workspace.occurredAt + activationWindowMs) {
      qualifiedAt = qualifiedAt === null ? action.occurredAt : Math.min(qualifiedAt, action.occurredAt);
    }
  }

  return { qualified: qualifiedAt !== null, matchedEvidenceAction, qualifiedAt };
}
