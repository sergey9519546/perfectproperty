export const clientProductEvents = [
  "landing_view",
  "story_viewed",
  "workspace_opened",
  "market_selected",
  "evidence_viewed",
  "underwrite_requested",
  "underwrite_failed",
  "brief_export_requested",
  "brief_export_failed",
  "web_vital",
] as const;

export type ClientProductEvent = (typeof clientProductEvents)[number];
export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue>;
export type WorkflowActionType = "underwrite" | "brief_export";

type TrackOptions = {
  entityType?: string;
  entityId?: string;
  success?: boolean;
  durationMs?: number;
  properties?: AnalyticsProperties;
  onceKey?: string;
};

type WorkflowActionInput = {
  actionType: WorkflowActionType;
  marketId: string;
  marketName: string;
  inputSnapshot: AnalyticsProperties;
  properties?: AnalyticsProperties;
};

type ClientContext = {
  client_event_id: string;
  occurred_at: string;
  session_id: string;
  anonymous_id: string;
  route: string;
  device_class: "mobile" | "tablet" | "desktop";
  reduced_motion: boolean;
  experiment_id: string | null;
  experiment_variant: string | null;
  analytics_allowed: boolean;
};

const anonymousKey = "pp.analytics.anonymous-id.v1";
const sessionKey = "pp.analytics.session-id.v1";
const oncePrefix = "pp.analytics.once.";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storageId(storage: Storage, key: string): string {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const id = newId();
    storage.setItem(key, id);
    return id;
  } catch {
    return newId();
  }
}

export function analyticsAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  const globalPrivacyControl = (navigator as Navigator & { globalPrivacyControl?: boolean })
    .globalPrivacyControl;
  return navigator.doNotTrack !== "1" && globalPrivacyControl !== true;
}

export function deviceClass(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function experiment(): Pick<ClientContext, "experiment_id" | "experiment_variant"> {
  const query = new URLSearchParams(window.location.search);
  const experimentId = query.get("pp_exp")?.slice(0, 80) || null;
  const experimentVariant = experimentId ? query.get("pp_variant")?.slice(0, 80) || null : null;
  return { experiment_id: experimentId, experiment_variant: experimentVariant };
}

function context(): ClientContext {
  return {
    client_event_id: newId(),
    occurred_at: new Date().toISOString(),
    session_id: storageId(window.sessionStorage, sessionKey),
    anonymous_id: storageId(window.localStorage, anonymousKey),
    route: `${window.location.pathname}${window.location.hash}`.slice(0, 300) || "/",
    device_class: deviceClass(window.innerWidth),
    reduced_motion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    analytics_allowed: analyticsAllowed(),
    ...experiment(),
  };
}

function acquisitionProperties(): AnalyticsProperties {
  const query = new URLSearchParams(window.location.search);
  const properties: AnalyticsProperties = {
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
  };
  const referrer = document.referrer;
  if (referrer) {
    try {
      properties.referrer_host = new URL(referrer).hostname.slice(0, 160);
    } catch {
      // Ignore malformed referrers rather than sending their raw value.
    }
  }
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const) {
    const value = query.get(key);
    if (value) properties[key] = value.slice(0, 160);
  }
  return properties;
}

async function post(path: string, body: object): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export async function trackProductEvent(
  eventName: ClientProductEvent,
  options: TrackOptions = {},
): Promise<boolean> {
  if (typeof window === "undefined" || !analyticsAllowed()) return false;
  if (options.onceKey) {
    try {
      if (window.sessionStorage.getItem(`${oncePrefix}${options.onceKey}`)) return true;
    } catch {
      // Continue without local deduplication; the server still deduplicates by event ID.
    }
  }

  const response = await post("/api/analytics/events", {
    ...context(),
    event_name: eventName,
    entity_type: options.entityType,
    entity_id: options.entityId,
    success: options.success,
    duration_ms: options.durationMs,
    properties: { ...acquisitionProperties(), ...options.properties },
  });
  const accepted = response?.ok === true;
  if (accepted && options.onceKey) {
    try {
      window.sessionStorage.setItem(`${oncePrefix}${options.onceKey}`, "1");
    } catch {
      // Storage is an optimization, not a requirement.
    }
  }
  return accepted;
}

export async function recordWorkflowAction(input: WorkflowActionInput): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const response = await post("/api/analytics/actions", {
    ...context(),
    action_type: input.actionType,
    market_id: input.marketId,
    market_name: input.marketName,
    input_snapshot: input.inputSnapshot,
    properties: { ...acquisitionProperties(), ...input.properties },
  });
  if (!response?.ok) return null;
  try {
    const payload = (await response.json()) as { action_id?: string };
    return payload.action_id ?? null;
  } catch {
    return null;
  }
}
