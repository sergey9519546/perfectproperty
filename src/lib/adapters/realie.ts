/**
 * Realie Property Data API adapter.
 *
 * https://docs.realie.ai — base URL https://app.realie.ai/api
 * Auth: pass the API key as-is in the `Authorization` header (NOT "Bearer …").
 *
 * All calls MUST read REALIE_API_KEY inside the function body so per-request
 * Worker env injection works. Never call from the browser — this is server-only.
 */

export interface RealieProperty {
  parcelId?: string;
  address?: string;
  addressFull?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  fipsState?: string;
  fipsCounty?: string;
  latitude?: number;
  longitude?: number;
  yearBuilt?: number;
  buildingArea?: number;
  totalBedrooms?: number;
  totalBathrooms?: number;
  acres?: number;
  landArea?: number;
  ownerName?: string;
  ownerState?: string;
  ownerCity?: string;
  totalAssessedValue?: number;
  totalMarketValue?: number;
  modelValue?: number;
  equityCurrentEstBal?: number;
  LTVCurrentEstCombined?: number;
  lastSalePrice?: number;
  transferPrice?: number;
  transferDateObject?: string;
  forecloseCode?: string;
  forecloseRecordDate?: string;
  auctionDate?: string;
  [k: string]: any;
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
  [k: string]: any;
}

const BASE = "https://app.realie.ai/api";

async function call<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const key = process.env.REALIE_API_KEY;
  if (!key) throw new Error("REALIE_API_KEY is not configured");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    q.set(k, String(v));
  }
  const url = `${BASE}${path}${q.toString() ? `?${q}` : ""}`;
  const { retryWithBackoff } = await import("@/lib/retry");
  return retryWithBackoff(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: key, Accept: "application/json" },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      const msg = body?.error ?? res.statusText ?? `HTTP ${res.status}`;
      throw new Error(`Realie ${res.status}: ${msg}`);
    }
    return body as T;
  }, { retries: 3, baseMs: 500 });
}

export async function realieLookupAddress(args: {
  address: string;
  state: string;
  unitNumberStripped?: string;
  city?: string;
  county?: string;
}): Promise<RealieProperty | null> {
  try {
    const r = await call<{ property?: RealieProperty }>("/public/property/address/", {
      address: args.address,
      state: args.state,
      unitNumberStripped: args.unitNumberStripped,
      city: args.city,
      county: args.county,
    });
    const p = r?.property;
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
}): Promise<RealieProperty | null> {
  try {
    const r = await call<{ property?: RealieProperty }>("/public/property/parcelId/", args);
    return r?.property ?? null;
  } catch (e: any) {
    if (String(e.message).includes("404")) return null;
    throw e;
  }
}

export async function realieLocationSearch(args: {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  includeUnassignedAddress?: boolean;
}): Promise<RealieProperty[]> {
  const r = await call<{ properties?: RealieProperty[] }>("/public/property/location/", {
    latitude: args.latitude,
    longitude: args.longitude,
    radius: args.radius ?? 0.05,
    limit: args.limit ?? 25,
    includeUnassignedAddress: args.includeUnassignedAddress ? "true" : undefined,
  });
  return r?.properties ?? [];
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
}): Promise<RealieComp[]> {
  try {
    const r = await call<{ comparables?: RealieComp[] }>("/public/premium/comparables/", {
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
    });
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
): Array<{ ppsf: number; distance_km: number; address: string | null; sold_at: string | undefined; sale_price: number; living_sqft: number | null }> {
  const out = [];
  for (const c of comps) {
    const price = Number(c.transferPrice ?? c.lastSalePrice ?? 0);
    const sqft = Number(c.buildingArea ?? 0);
    if (!(price > 20000) || !(sqft > 200)) continue;
    const lat = Number(c.latitude ?? NaN);
    const lng = Number(c.longitude ?? NaN);
    const dKm = Number.isFinite(lat) && Number.isFinite(lng)
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

/**
 * Normalize a Realie property into our `parcels` row shape.
 * Returns null if we don't have enough to insert.
 */
export function realieToParcelRow(p: RealieProperty, fallbackState?: string): any | null {
  const address = (p.address ?? p.addressFull ?? "").trim();
  const state = (p.state ?? fallbackState ?? "").trim().toUpperCase();
  if (!address || !state) return null;
  const fipsState = String(p.fipsState ?? "").padStart(2, "0");
  const fipsCounty = String(p.fipsCounty ?? "").padStart(3, "0");
  const county_fips = fipsState && fipsCounty ? `${fipsState}${fipsCounty}` : "00000";
  const yb = Number(p.yearBuilt) || null;
  const age = yb ? new Date().getFullYear() - yb : null;
  const condition_grade = age == null ? "B" : age < 15 ? "A" : age < 40 ? "B" : age < 70 ? "C" : "D";
  const ownerState = (p.ownerState ?? "").trim().toUpperCase();
  const owner_is_absentee = Boolean(ownerState && state && ownerState !== state);
  return {
    apn: String(p.parcelId ?? crypto.randomUUID()),
    county_fips,
    address,
    city: p.city ?? null,
    state,
    zip: p.zipCode ?? null,
    lat: Number.isFinite(Number(p.latitude)) ? Number(p.latitude) : null,
    lng: Number.isFinite(Number(p.longitude)) ? Number(p.longitude) : null,
    property_type: "SFR",
    year_built: yb,
    living_sqft: Number(p.buildingArea) || null,
    lot_sqft: Number(p.landArea) || null,
    bedrooms: Number(p.totalBedrooms) || null,
    bathrooms: Number(p.totalBathrooms) || null,
    condition_grade,
    flood_zone: "X",
    school_score: 6,
    owner_name: p.ownerName ?? null,
    owner_is_absentee,
    owner_is_corporate: /LLC|INC|TRUST|CORP|LP\b/i.test(String(p.ownerName ?? "")),
    assessed_value: Number(p.totalAssessedValue) || null,
    estimated_equity: Number(p.equityCurrentEstBal) || null,
    is_listed: false,
    is_vacant: false,
    data_source: "LIVE",
    source_url: "https://app.realie.ai",
    last_seen_at: new Date().toISOString(),
  };
}
