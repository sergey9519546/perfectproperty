/**
 * Realie Property Data API adapter.
 *
 * https://docs.realie.ai — base URL https://app.realie.ai/api
 * Auth: pass the API key as-is in the `Authorization` header (NOT "Bearer …").
 *
 * All calls MUST read REALIE_API_KEY inside the function body so per-request
 * Worker env injection works. Never call from the browser — this is server-only.
 */

export type RealieBudgetClass = "background" | "interactive";

export interface RealieAssessment {
  assessedYear?: number | null;
  totalAssessedValue?: number | null;
  totalBuildingValue?: number | null;
  totalLandValue?: number | null;
  totalMarketValue?: number | null;
  marketValueYear?: number | null;
  taxValue?: number | null;
  taxYear?: number | null;
  [key: string]: unknown;
}

export interface RealieTransfer {
  recordingDate?: string | null;
  transferDate?: string | null;
  transferDateObject?: string | null;
  transferPrice?: number | null;
  grantee?: string | null;
  grantor?: string | null;
  buyerIDCode?: string | null;
  buyerVestingCode?: string | null;
  bookNum?: string | null;
  pageNum?: string | null;
  transferDocType?: string | null;
  transferDocNum?: string | null;
  [key: string]: unknown;
}

export interface RealieGeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
  [key: string]: unknown;
}

export interface RealieGeoJsonMultiPolygon {
  type: "MultiPolygon" | "Polygon";
  coordinates: unknown;
  [key: string]: unknown;
}

/**
 * The complete documented Realie property record. Realie can add provider- or
 * county-specific fields without notice, so the index signature deliberately
 * preserves unknown keys for raw snapshot storage by callers.
 */
export interface RealieProperty {
  // Address and parcel identity.
  parcelId?: string | null;
  address?: string | null;
  addressFull?: string | null;
  street?: string | null;
  /** Legacy/provider alias for `streetType`. */
  type?: string | null;
  streetType?: string | null;
  /** Legacy/provider alias for `streetNumber`. */
  number?: string | null;
  streetNumber?: string | null;
  /** Legacy/provider alias for `unitNumber`. */
  unit?: string | null;
  unitNumber?: string | null;
  unitNumberStripped?: string | null;
  addressUnit?: string | null;
  county?: string | null;
  city?: string | null;
  /** Legacy/provider alias for `zipCode`. */
  zip?: string | null;
  zipCode?: string | null;
  state?: string | null;

  // Physical characteristics.
  propertyType?: string | null;
  buildingArea?: number | null;
  basementType?: string | null;
  wallType?: string | null;
  fireplaceCount?: number | null;
  fireplace?: boolean | null;
  floorType?: string | null;
  foundationType?: string | null;
  foundation?: string | null;
  garageCount?: number | null;
  garage?: boolean | null;
  garageType?: string | null;
  buildingCount?: number | null;
  stories?: number | null;
  totalBathrooms?: number | null;
  baths?: number | null;
  totalBedrooms?: number | null;
  beds?: number | null;
  pool?: boolean | null;
  poolCode?: string | null;
  roofType?: string | null;
  roof?: string | null;
  roofStyle?: string | null;
  constructionType?: string | null;
  construction?: string | null;
  yearBuilt?: number | null;
  residential?: boolean | null;

  // Owner and mailing information.
  ownerName?: string | null;
  ownerAddressLine1?: string | null;
  ownerCity?: string | null;
  ownerState?: string | null;
  ownerZipCode?: string | null;
  ownerResCount?: number | null;
  ownerComCount?: number | null;
  ownerOriginCode?: string | null;
  ownerParcelCount?: number | null;

  // Land, legal description, and zoning.
  legalDesc?: string | null;
  subdivision?: string | null;
  zoningCode?: string | null;
  zoning?: string | null;
  secTwnRng?: string | null;
  blockNum?: string | null;
  lotNum?: string | null;
  jurisdiction?: string | null;
  districtNum?: string | null;
  citySection?: string | null;
  landLot?: string | null;
  lotCode?: string | null;
  phaseNum?: string | null;
  tractNum?: string | null;
  acres?: number | null;
  depthSize?: number | null;
  frontage?: number | null;
  landArea?: number | null;

  // Assessments, tax, and AVM.
  totalAssessedValue?: number | null;
  assessedYear?: number | null;
  taxValue?: number | null;
  taxYear?: number | null;
  totalBuildingValue?: number | null;
  totalLandValue?: number | null;
  totalMarketValue?: number | null;
  marketValueYear?: number | null;
  taxRateCodeArea?: string | null;
  useCode?: string | number | null;
  modelValue?: number | null;
  modelValueMin?: number | null;
  modelValueMax?: number | null;
  assessments?: RealieAssessment[] | null;

  // Current and historical transfer/recording data.
  recordingDate?: string | null;
  transferDate?: string | null;
  transferDateObject?: string | null;
  transferPrice?: number | null;
  lastSalePrice?: number | null;
  buyerIDCode?: string | null;
  bookNum?: string | null;
  pageNum?: string | null;
  buyerVestingCode?: string | null;
  ownershipStartDate?: string | null;
  transferDocType?: string | null;
  transferDocNum?: string | null;
  grantee?: string | null;
  grantor?: string | null;
  transfers?: RealieTransfer[] | null;

  // Mortgage, lien, and equity data.
  totalLienCount?: number | null;
  totalLienBalance?: number | null;
  totalFinancingHistCount?: number | null;
  LTVCurrentEstCombined?: number | null;
  LTVCurrentEstRange?: number | null;
  equityCurrentEstBal?: number | null;
  equityCurrentEstRange?: number | null;
  LTVPurchase?: number | null;
  lenderName?: string | null;

  // Foreclosure/distress data.
  forecloseCode?: string | null;
  forecloseRecordDate?: string | null;
  forecloseFileDate?: string | null;
  forecloseCaseNum?: string | null;
  auctionDate?: string | null;

  // Geographic identifiers and geometry.
  fipsState?: string | null;
  fipsCounty?: string | null;
  siteCensusTract?: string | null;
  neighborhood?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  siteId?: string | null;
  location?: RealieGeoJsonPoint | null;
  point?: RealieGeoJsonPoint | null;
  geometry?: RealieGeoJsonMultiPolygon | null;
  polygon?: RealieGeoJsonMultiPolygon | null;

  [key: string]: unknown;
}

export interface RealieComp {
  parcelId?: string;
  address?: string;
  addressFull?: string;
  latitude?: number;
  longitude?: number;
  buildingArea?: number;
  totalBedrooms?: number;
  totalBathrooms?: number;
  transferPrice?: number;
  lastSalePrice?: number;
  transferDateObject?: string;
  [key: string]: unknown;
}

export interface RealieSearchMetadata {
  limit?: number;
  count?: number;
  nextCursor?: string | null;
  offset?: number;
  deprecationNotice?: string;
  [key: string]: unknown;
}

export interface RealiePropertySearchPage {
  properties: RealieProperty[];
  metadata: RealieSearchMetadata | null;
}

export class RealieBudgetExhaustedError extends Error {
  readonly code = "REALIE_BUDGET_EXHAUSTED";
  readonly endpoint: string;
  readonly budgetClass: RealieBudgetClass;

  constructor(endpoint: string, budgetClass: RealieBudgetClass) {
    super(`Realie request budget exhausted for ${budgetClass} calls (${endpoint})`);
    this.name = "RealieBudgetExhaustedError";
    this.endpoint = endpoint;
    this.budgetClass = budgetClass;
  }
}

export class RealieBudgetReservationError extends Error {
  readonly code = "REALIE_BUDGET_RESERVATION_FAILED";

  constructor(endpoint: string, message: string) {
    super(`Could not reserve a Realie request for ${endpoint}: ${message}`);
    this.name = "RealieBudgetReservationError";
  }
}

const BASE = "https://app.realie.ai/api";

/**
 * Optional audit sink. Callers (e.g. the nightly enrichment endpoint) can
 * register a hook via `setRealieAuditSink` to capture every HTTP call —
 * endpoint, request params, response code, duration, and normalized error.
 * Kept as a module-level mutable ref for Worker compatibility (no
 * AsyncLocalStorage required). Callers should set/clear per invocation.
 */
export type RealieAuditEntry = {
  endpoint: string;
  params: Record<string, unknown>;
  http_status: number | null;
  ok: boolean;
  duration_ms: number;
  error_code: string | null;
  error_message: string | null;
  response_sample: unknown | null;
};
let auditSink: ((e: RealieAuditEntry) => void) | null = null;
export function setRealieAuditSink(fn: ((e: RealieAuditEntry) => void) | null) {
  auditSink = fn;
}

type QueryValue = string | number | boolean | null | undefined;

async function reserveRealieCall(endpoint: string, budgetClass: RealieBudgetClass): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("reserve_realie_call", {
    p_endpoint: endpoint,
    p_budget_class: budgetClass,
  });
  if (error) throw new RealieBudgetReservationError(endpoint, error.message ?? "database error");
  if (data !== true) throw new RealieBudgetExhaustedError(endpoint, budgetClass);
}

function propertyCountFromResponse(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const value = body as {
    property?: unknown;
    properties?: unknown;
    comparables?: unknown;
  };
  if (Array.isArray(value.properties)) return value.properties.length;
  if (Array.isArray(value.comparables)) return value.comparables.length;
  if (value.property && typeof value.property === "object") return 1;
  if (
    "parcelId" in (body as Record<string, unknown>) ||
    "address" in (body as Record<string, unknown>) ||
    "addressFull" in (body as Record<string, unknown>)
  ) {
    return 1;
  }
  return 0;
}

function propertyFromResponse(
  response: RealieProperty | { property?: RealieProperty | null } | null | undefined,
): RealieProperty | null {
  if (!response || typeof response !== "object") return null;
  if ("property" in response) {
    const property = (response as { property?: RealieProperty | null }).property;
    return property && typeof property === "object" ? safeParseRealieProperty(property) : null;
  }
  if ("parcelId" in response || "address" in response || "addressFull" in response) {
    return safeParseRealieProperty(response);
  }
  return null;
}

async function recordRealieCallResult(
  endpoint: string,
  success: boolean,
  propertyCount: number,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).rpc("record_realie_call_result", {
      p_endpoint: endpoint,
      p_success: success,
      p_property_count: propertyCount,
    });
  } catch {
    // The reservation is the authoritative credit counter. Usage telemetry is
    // best-effort and must never turn an otherwise valid provider response into
    // an application error or hide the original provider/network failure.
  }
}

async function call<T>(
  path: string,
  params: Record<string, QueryValue>,
  budgetClass: RealieBudgetClass = "background",
): Promise<T> {
  const key = process.env.REALIE_API_KEY;
  if (!key) throw new Error("REALIE_API_KEY is not configured");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    q.set(k, String(v));
  }
  const url = `${BASE}${path}${q.toString() ? `?${q}` : ""}`;
  const { retryWithBackoff } = await import("@/lib/retry");
  return retryWithBackoff(
    async () => {
      // Realie bills by request. Reserve inside the retried callback so every
      // actual HTTP attempt (including 429/5xx retries) consumes one slot.
      await reserveRealieCall(path, budgetClass);
      const started = Date.now();
      let status: number | null = null;
      let body: any = null;
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: key, Accept: "application/json" },
        });
        status = res.status;
        const text = await res.text();
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text };
        }
        if (!res.ok) {
          const msg = body?.error ?? res.statusText ?? `HTTP ${res.status}`;
          const err = new Error(`Realie ${res.status}: ${msg}`);
          (err as any).status = res.status;
          throw err;
        }
        await recordRealieCallResult(path, true, propertyCountFromResponse(body));
        if (auditSink) {
          try {
            auditSink({
              endpoint: path,
              params,
              http_status: status,
              ok: true,
              duration_ms: Date.now() - started,
              error_code: null,
              error_message: null,
              response_sample: null,
            });
          } catch {
            /* never let audit break the call */
          }
        }
        return body as T;
      } catch (e: any) {
        await recordRealieCallResult(path, false, 0);
        if (auditSink) {
          try {
            auditSink({
              endpoint: path,
              params,
              http_status: status,
              ok: false,
              duration_ms: Date.now() - started,
              error_code: status ? `HTTP_${status}` : "NETWORK",
              error_message: String(e?.message ?? e).slice(0, 500),
              response_sample: body && typeof body === "object" ? body : null,
            });
          } catch {
            /* swallow */
          }
        }
        throw e;
      }
    },
    { retries: 3, baseMs: 500 },
  );
}

export async function realieLookupAddress(args: {
  address: string;
  state: string;
  unitNumberStripped?: string;
  city?: string;
  county?: string;
  budgetClass?: RealieBudgetClass;
}): Promise<RealieProperty | null> {
  try {
    const r = await call<RealieProperty | { property?: RealieProperty }>(
      "/public/property/address/",
      {
        address: args.address,
        state: args.state,
        unitNumberStripped: args.unitNumberStripped,
        city: args.city,
        county: args.county,
      },
      args.budgetClass,
    );
    const p = propertyFromResponse(r);
    if (!p || Object.keys(p).length === 0) return null;
    return p;
  } catch (e: any) {
    if (String(e.message).includes("404")) return null;
    throw e;
  }
}

export async function realieLookupParcelId(args: {
  parcelId: string;
  state: string;
  county?: string;
  budgetClass?: RealieBudgetClass;
}): Promise<RealieProperty | null> {
  try {
    const r = await call<RealieProperty | { property?: RealieProperty }>(
      "/public/property/parcelId/",
      { parcelId: args.parcelId, state: args.state, county: args.county },
      args.budgetClass,
    );
    return propertyFromResponse(r);
  } catch (e: any) {
    if (String(e.message).includes("404")) return null;
    throw e;
  }
}

export type RealiePropertySearchArgs = {
  state: string;
  zipCode?: string;
  county?: string;
  city?: string;
  /** Realie's API spells this parameter `transferedSince`. */
  transferedSince?: string | number;
  useCode?: string | number;
  address?: string;
  unitNumberStripped?: string;
  includeUnassignedAddress?: boolean;
  limit?: number;
  cursor?: string;
  /** Deprecated by Realie; prefer cursor for deep pagination. */
  offset?: number;
  residential?: boolean;
  budgetClass?: RealieBudgetClass;
};

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value!)));
}

function boundedNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value!));
}

/**
 * Property-search page including Realie's opaque next cursor. Use this when
 * traversing more than one page; `realiePropertySearch` is the array-only
 * convenience wrapper used by the enrichment batcher.
 */
export async function realiePropertySearchPage(
  args: RealiePropertySearchArgs,
): Promise<RealiePropertySearchPage> {
  try {
    const r = await call<{
      properties?: RealieProperty[];
      metadata?: RealieSearchMetadata;
    }>(
      "/public/property/search/",
      {
        state: args.state,
        zipCode: args.zipCode,
        county: args.county,
        city: args.city,
        transferedSince: args.transferedSince,
        useCode: args.useCode,
        address: args.address,
        unitNumberStripped: args.unitNumberStripped,
        includeUnassignedAddress: args.includeUnassignedAddress,
        limit: boundedInteger(args.limit, 10, 1, 100),
        cursor: args.cursor,
        offset:
          args.offset === undefined ? undefined : boundedInteger(args.offset, 0, 0, 1_000_000_000),
        residential: args.residential,
      },
      args.budgetClass,
    );
    return { properties: r?.properties ?? [], metadata: r?.metadata ?? null };
  } catch (e: any) {
    if (String(e?.message ?? e).match(/404|No properties/i)) {
      return { properties: [], metadata: null };
    }
    throw e;
  }
}

export async function realiePropertySearch(
  args: RealiePropertySearchArgs,
): Promise<RealieProperty[]> {
  return (await realiePropertySearchPage(args)).properties;
}

export async function realieLocationSearch(args: {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  includeUnassignedAddress?: boolean;
  offset?: number;
  residential?: boolean;
  budgetClass?: RealieBudgetClass;
}): Promise<RealieProperty[]> {
  try {
    const r = await call<{ properties?: RealieProperty[] }>(
      "/public/property/location/",
      {
        latitude: args.latitude,
        longitude: args.longitude,
        radius: boundedNumber(args.radius, 0.05, 0, 2),
        limit: boundedInteger(args.limit, 25, 1, 100),
        includeUnassignedAddress: args.includeUnassignedAddress,
        offset:
          args.offset === undefined ? undefined : boundedInteger(args.offset, 0, 0, 1_000_000_000),
        residential: args.residential,
      },
      args.budgetClass,
    );
    return r?.properties ?? [];
  } catch (e: any) {
    if (String(e?.message ?? e).match(/404|No properties/i)) return [];
    throw e;
  }
}

export async function realieComparables(args: {
  latitude: number;
  longitude: number;
  radius?: number;
  timeFrame?: number;
  maxResults?: number;
  sqftMin?: number;
  sqftMax?: number;
  bedsMin?: number;
  bedsMax?: number;
  propertyType?: "any" | "house" | "condo";
  budgetClass?: RealieBudgetClass;
}): Promise<RealieComp[]> {
  try {
    const r = await call<{ comparables?: RealieComp[] }>(
      "/public/premium/comparables/",
      {
        latitude: args.latitude,
        longitude: args.longitude,
        radius: args.radius ?? 1,
        timeFrame: args.timeFrame ?? 18,
        maxResults: Math.min(args.maxResults ?? 25, 50),
        sqftMin: args.sqftMin,
        sqftMax: args.sqftMax,
        bedsMin: args.bedsMin,
        bedsMax: args.bedsMax,
        propertyType: args.propertyType,
      },
      args.budgetClass,
    );
    return r?.comparables ?? [];
  } catch (e: any) {
    // "No comparable properties found" comes back as 404 in prod.
    if (String(e.message).match(/404|No comparable/i)) return [];
    throw e;
  }
}

/**
 * Haversine km between two lat/lng points.
 */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Convert Realie comps into the shape our engine's `Comp` type consumes.
 * Filters out rows without a usable price and sqft.
 */
export function realieCompsToEngineComps(
  comps: RealieComp[],
  subjectLat: number,
  subjectLng: number,
): Array<{
  ppsf: number;
  distance_km: number;
  address: string | null;
  sold_at: string | undefined;
  sale_price: number;
  living_sqft: number | null;
}> {
  const out = [];
  for (const c of comps) {
    const price = Number(c.transferPrice ?? c.lastSalePrice ?? 0);
    const sqft = Number(c.buildingArea ?? 0);
    if (!(price > 20000) || !(sqft > 200)) continue;
    const lat = Number(c.latitude ?? NaN);
    const lng = Number(c.longitude ?? NaN);
    const dKm =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? distanceKm(subjectLat, subjectLng, lat, lng)
        : 3.0;
    out.push({
      ppsf: price / sqft,
      distance_km: dKm,
      address: c.addressFull ?? c.address ?? null,
      sold_at: c.transferDateObject,
      sale_price: price,
      living_sqft: sqft,
    });
  }
  return out;
}

function nonBlank(value: unknown): string | null {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text || null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

/** Convert Realie's compact/ISO date variants into a Postgres DATE value. */
export function realieDateToIsoDate(value: unknown): string | null {
  const text = nonBlank(value);
  if (!text) return null;
  if (/^\d{8}$/.test(text)) {
    const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    const date = new Date(`${iso}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
  }
  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!isoPrefix) return null;
  const date = new Date(`${isoPrefix}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoPrefix
    ? null
    : isoPrefix;
}

export interface RealieDeedRow {
  /** Deterministic key for application-side de-duplication before insert. */
  source_key: string;
  recorded_at: string;
  deed_type: string;
  sale_price: number | null;
  buyer: string | null;
  seller: string | null;
  loan_amount: null;
  data_source: "REALIE";
}

function transferSourceKey(parcelId: string, transfer: RealieTransfer): string {
  const document = nonBlank(transfer.transferDocNum);
  if (document) return `REALIE|${parcelId}|DOC|${document.toUpperCase()}`;
  return [
    "REALIE",
    parcelId,
    realieDateToIsoDate(
      transfer.recordingDate ?? transfer.transferDateObject ?? transfer.transferDate,
    ) ?? "",
    nonBlank(transfer.transferPrice) ?? "",
    nonBlank(transfer.grantor)?.toUpperCase() ?? "",
    nonBlank(transfer.grantee)?.toUpperCase() ?? "",
  ].join("|");
}

/**
 * Normalize current plus historical transfers without inventing deed IDs.
 * Records without a usable recording/transfer date are skipped because the
 * local deeds table requires a date. `source_key` is built from provider
 * document/date fields and is not intended to replace a county document ID.
 */
export function realieToDeedRows(property: RealieProperty): RealieDeedRow[] {
  const parcelId = nonBlank(property.parcelId);
  if (!parcelId) return [];

  const current: RealieTransfer = {
    recordingDate: property.recordingDate,
    transferDate: property.transferDate,
    transferDateObject: property.transferDateObject,
    transferPrice: property.transferPrice ?? property.lastSalePrice,
    grantee: nonBlank(property.grantee),
    grantor: nonBlank(property.grantor),
    buyerIDCode: property.buyerIDCode,
    buyerVestingCode: property.buyerVestingCode,
    bookNum: property.bookNum,
    pageNum: property.pageNum,
    transferDocType: property.transferDocType,
    transferDocNum: property.transferDocNum,
  };
  const transfers = [...(property.transfers ?? [])];
  if (
    current.recordingDate ||
    current.transferDate ||
    current.transferDateObject ||
    current.transferDocNum
  ) {
    transfers.unshift(current);
  }

  const deduped = new Map<string, RealieDeedRow>();
  for (const transfer of transfers) {
    const recordedAt = realieDateToIsoDate(
      transfer.recordingDate ?? transfer.transferDateObject ?? transfer.transferDate,
    );
    if (!recordedAt) continue;
    const sourceKey = transferSourceKey(parcelId, transfer);
    const normalized: RealieDeedRow = {
      source_key: sourceKey,
      recorded_at: recordedAt,
      deed_type: nonBlank(transfer.transferDocType) ?? "TRANSFER",
      sale_price: finiteNumber(transfer.transferPrice),
      buyer: nonBlank(transfer.grantee),
      seller: nonBlank(transfer.grantor),
      // Aggregate current lien balance cannot safely be assigned to a deed.
      loan_amount: null,
      data_source: "REALIE",
    };
    const existing = deduped.get(sourceKey);
    deduped.set(
      sourceKey,
      existing
        ? {
            ...existing,
            deed_type:
              existing.deed_type === "TRANSFER" ? normalized.deed_type : existing.deed_type,
            sale_price: existing.sale_price ?? normalized.sale_price,
            buyer: existing.buyer ?? normalized.buyer,
            seller: existing.seller ?? normalized.seller,
          }
        : normalized,
    );
  }
  return [...deduped.values()];
}

export interface RealieDistressRow {
  source_event_id: string;
  event_type: "FORECLOSURE_NOD" | "AUCTION_SCHEDULED";
  event_date: string;
  severity: number;
  amount: null;
  auction_date: string | null;
  data_source: "REALIE";
  details: Record<string, string | number | null>;
}

/**
 * Normalize only explicit foreclosure/auction facts. Realie's aggregate lien
 * count/balance includes ordinary mortgages, so it is retained in details but
 * never mislabeled as a tax-lien distress signal.
 */
export function realieToDistressRows(property: RealieProperty): RealieDistressRow[] {
  const parcelId = nonBlank(property.parcelId);
  if (!parcelId) return [];
  const foreclosureDate = realieDateToIsoDate(
    property.forecloseFileDate ?? property.forecloseRecordDate,
  );
  const auctionDate = realieDateToIsoDate(property.auctionDate);
  const foreclosureCode = nonBlank(property.forecloseCode);
  const caseNumber = nonBlank(property.forecloseCaseNum);
  const commonDetails = {
    foreclose_code: foreclosureCode,
    foreclose_case_num: caseNumber,
    foreclose_record_date: realieDateToIsoDate(property.forecloseRecordDate),
    foreclose_file_date: realieDateToIsoDate(property.forecloseFileDate),
    total_lien_count: finiteNumber(property.totalLienCount),
    total_lien_balance: finiteNumber(property.totalLienBalance),
    lender_name: nonBlank(property.lenderName),
  };
  const rows: RealieDistressRow[] = [];
  if (foreclosureDate) {
    rows.push({
      source_event_id: [
        "REALIE",
        parcelId,
        "FORECLOSURE",
        caseNumber ?? foreclosureCode ?? foreclosureDate,
        foreclosureDate,
      ].join("|"),
      event_type: "FORECLOSURE_NOD",
      event_date: foreclosureDate,
      severity: 4,
      amount: null,
      auction_date: auctionDate,
      data_source: "REALIE",
      details: commonDetails,
    });
  }
  if (auctionDate) {
    rows.push({
      source_event_id: [
        "REALIE",
        parcelId,
        "AUCTION",
        caseNumber ?? foreclosureCode ?? "",
        auctionDate,
      ].join("|"),
      event_type: "AUCTION_SCHEDULED",
      event_date: auctionDate,
      severity: 5,
      amount: null,
      auction_date: auctionDate,
      data_source: "REALIE",
      details: commonDetails,
    });
  }
  return rows;
}

/**
 * Normalize a Realie property into our `parcels` row shape.
 * Returns null if we don't have enough to insert.
 */
export function realieToParcelRow(p: RealieProperty, fallbackState?: string): any | null {
  const apn = nonBlank(p.parcelId);
  const address = (p.address ?? p.addressFull ?? "").trim();
  const state = (p.state ?? fallbackState ?? "").trim().toUpperCase();
  if (!apn || !address || !state) return null;
  const rawFipsState = String(p.fipsState ?? "").trim();
  const rawFipsCounty = String(p.fipsCounty ?? "").trim();
  const county_fips =
    rawFipsState && rawFipsCounty
      ? rawFipsCounty.length >= 5 && rawFipsCounty.startsWith(rawFipsState.padStart(2, "0"))
        ? rawFipsCounty.slice(0, 5)
        : `${rawFipsState.padStart(2, "0")}${rawFipsCounty.padStart(3, "0").slice(-3)}`
      : null;
  const yb = positiveNumber(p.yearBuilt);
  const ownerState = (p.ownerState ?? "").trim().toUpperCase();
  const owner_is_absentee = ownerState ? ownerState !== state : null;
  const propertyType = String(p.propertyType ?? "").trim() || null;
  const landArea = positiveNumber(p.landArea);
  const acres = positiveNumber(p.acres);
  return {
    apn,
    county_fips,
    address,
    city: p.city ?? null,
    state,
    zip: p.zipCode ?? p.zip ?? null,
    lat: Number.isFinite(Number(p.latitude)) ? Number(p.latitude) : null,
    lng: Number.isFinite(Number(p.longitude)) ? Number(p.longitude) : null,
    property_type: propertyType,
    year_built: yb,
    living_sqft: positiveNumber(p.buildingArea),
    lot_sqft: landArea ?? (acres === null ? null : Math.round(acres * 43_560)),
    bedrooms: positiveNumber(p.totalBedrooms ?? p.beds),
    bathrooms: positiveNumber(p.totalBathrooms ?? p.baths),
    stories: positiveNumber(p.stories),
    condition_grade: null,
    flood_zone: null,
    school_score: null,
    owner_name: p.ownerName ?? null,
    owner_is_absentee,
    owner_is_corporate: p.ownerName
      ? /\b(?:LLC|INC|TRUST|CORP|CORPORATION|LP|LLP|LTD)\b/i.test(String(p.ownerName))
      : null,
    owner_since: realieDateToIsoDate(p.ownershipStartDate),
    assessed_value: finiteNumber(p.totalAssessedValue),
    estimated_equity: finiteNumber(p.equityCurrentEstBal),
    is_listed: null,
    is_vacant: null,
    data_source: "LIVE",
    source_url: "https://app.realie.ai",
    last_seen_at: new Date().toISOString(),
  };
}
