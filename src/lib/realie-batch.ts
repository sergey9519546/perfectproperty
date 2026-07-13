/**
 * Pure helpers for minimizing Realie calls. Keeping the grouping and matching
 * logic free of database/network dependencies makes the credit-saving rules
 * deterministic and unit-testable.
 */

export type RealieBatchRequest = {
  parcel_id: string;
  apn?: string | null;
  address: string;
  city?: string | null;
  state: string;
  zip?: string | null;
  county?: string | null;
  county_fips?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type RealiePropertyLike = {
  parcelId?: string | null;
  address?: string | null;
  addressFull?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
};

export type RealieLocationBatch<T extends RealieBatchRequest = RealieBatchRequest> = {
  requests: T[];
  latitude: number;
  longitude: number;
  radius: number;
};

const ADDRESS_TOKEN_MAP: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  ROAD: "RD",
  DRIVE: "DR",
  LANE: "LN",
  COURT: "CT",
  CIRCLE: "CIR",
  HIGHWAY: "HWY",
  PARKWAY: "PKWY",
  PLACE: "PL",
  TERRACE: "TER",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  APARTMENT: "APT",
  SUITE: "STE",
};

function normalizedTokens(value: string): string[] {
  const tokens = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/#/g, " APT ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ADDRESS_TOKEN_MAP[token] ?? token);
  return tokens.filter((token, index) => token !== tokens[index - 1]);
}

export function normalizeRealieAddress(value: string | null | undefined): string {
  return value ? normalizedTokens(value).join(" ") : "";
}

export function normalizeRealieApn(value: string | null | undefined): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Stable key shared by the negative cache and exact-lookup de-duplication. */
export function realieLookupKey(
  input: Pick<RealieBatchRequest, "address" | "state"> &
    Partial<Pick<RealieBatchRequest, "city" | "county">> & { unit?: string | null },
): string {
  return [
    normalizeRealieAddress(input.address),
    normalizeRealieAddress(input.unit),
    normalizeRealieAddress(input.city),
    normalizeRealieAddress(input.county),
    String(input.state ?? "")
      .trim()
      .toUpperCase(),
  ].join("|");
}

export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Greedily builds tight geographic clusters. Singleton clusters are omitted:
 * paying for a radius search for one parcel can only be equal to or more
 * expensive than its exact-address lookup.
 */
export function buildRealieLocationBatches<T extends RealieBatchRequest>(
  requests: T[],
  options: { maxRadiusMiles?: number; maxRequests?: number; minRequests?: number } = {},
): RealieLocationBatch<T>[] {
  const maxRadius = Math.min(Math.max(options.maxRadiusMiles ?? 0.2, 0.05), 1.95);
  const maxRequests = Math.min(Math.max(Math.floor(options.maxRequests ?? 100), 2), 100);
  const minRequests = Math.max(Math.floor(options.minRequests ?? 2), 2);
  const pending = requests
    .filter(
      (request) => Number.isFinite(Number(request.lat)) && Number.isFinite(Number(request.lng)),
    )
    .sort((a, b) => a.parcel_id.localeCompare(b.parcel_id));
  const batches: RealieLocationBatch<T>[] = [];

  while (pending.length) {
    const seed = pending.shift()!;
    const cluster = [seed];

    for (let index = 0; index < pending.length && cluster.length < maxRequests;) {
      const candidate = pending[index];
      const tentative = [...cluster, candidate];
      const latitude =
        tentative.reduce((sum, request) => sum + Number(request.lat), 0) / tentative.length;
      const longitude =
        tentative.reduce((sum, request) => sum + Number(request.lng), 0) / tentative.length;
      const fits = tentative.every(
        (request) =>
          distanceMiles(latitude, longitude, Number(request.lat), Number(request.lng)) <= maxRadius,
      );
      if (fits) {
        cluster.push(candidate);
        pending.splice(index, 1);
      } else {
        index += 1;
      }
    }

    if (cluster.length < minRequests) continue;
    const latitude =
      cluster.reduce((sum, request) => sum + Number(request.lat), 0) / cluster.length;
    const longitude =
      cluster.reduce((sum, request) => sum + Number(request.lng), 0) / cluster.length;
    const furthest = Math.max(
      ...cluster.map((request) =>
        distanceMiles(latitude, longitude, Number(request.lat), Number(request.lng)),
      ),
    );
    batches.push({
      requests: cluster,
      latitude,
      longitude,
      radius: Math.min(1.99, Math.max(0.05, furthest + 0.025)),
    });
  }

  return batches;
}

function propertyAddressKeys(property: RealiePropertyLike): string[] {
  const keys = new Set<string>();
  if (property.address) keys.add(normalizeRealieAddress(property.address));
  if (property.addressFull) {
    keys.add(normalizeRealieAddress(property.addressFull));
    const streetPart = property.addressFull.split(",", 1)[0];
    if (streetPart) keys.add(normalizeRealieAddress(streetPart));
  }
  keys.delete("");
  return [...keys];
}

function matchScore(request: RealieBatchRequest, property: RealiePropertyLike): number {
  const requestApn = normalizeRealieApn(request.apn);
  const propertyApn = normalizeRealieApn(property.parcelId);
  if (requestApn && propertyApn && requestApn === propertyApn) return 100;

  const requestAddress = normalizeRealieAddress(request.address);
  if (!requestAddress || !propertyAddressKeys(property).includes(requestAddress)) return 0;

  const requestState = String(request.state ?? "")
    .trim()
    .toUpperCase();
  const propertyState = String(property.state ?? "")
    .trim()
    .toUpperCase();
  if (requestState && propertyState && requestState !== propertyState) return 0;

  const requestCity = normalizeRealieAddress(request.city);
  const propertyCity = normalizeRealieAddress(property.city);
  if (requestCity && propertyCity && requestCity !== propertyCity) return 0;

  const requestZip = String(request.zip ?? "")
    .replace(/\D/g, "")
    .slice(0, 5);
  const propertyZip = String(property.zipCode ?? "")
    .replace(/\D/g, "")
    .slice(0, 5);
  if (requestZip && propertyZip && requestZip !== propertyZip) return 0;

  return (
    60 +
    (requestState && propertyState ? 10 : 0) +
    (requestCity && propertyCity ? 10 : 0) +
    (requestZip && propertyZip ? 10 : 0)
  );
}

/**
 * Deterministically performs a one-to-one match, preferring APN and then an
 * exact normalized street/city/state/ZIP match. Fuzzy matches are deliberately
 * excluded because attaching a neighbor's facts is worse than a cache miss.
 */
export function matchRealieProperties<T extends RealiePropertyLike>(
  requests: RealieBatchRequest[],
  properties: T[],
): Map<string, T> {
  const matched = new Map<string, T>();
  const used = new Set<number>();

  for (const request of [...requests].sort((a, b) => a.parcel_id.localeCompare(b.parcel_id))) {
    const candidates = properties
      .map((property, index) => ({ property, index, score: matchScore(request, property) }))
      .filter((candidate) => candidate.score > 0 && !used.has(candidate.index))
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        const aKey = `${normalizeRealieApn(a.property.parcelId)}|${normalizeRealieAddress(a.property.addressFull ?? a.property.address)}`;
        const bKey = `${normalizeRealieApn(b.property.parcelId)}|${normalizeRealieAddress(b.property.addressFull ?? b.property.address)}`;
        return aKey.localeCompare(bKey);
      });
    const best = candidates[0];
    if (!best) continue;
    used.add(best.index);
    matched.set(request.parcel_id, best.property);
  }

  return matched;
}
