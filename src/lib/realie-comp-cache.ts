export interface RealieCompCacheInput {
  latitude: number;
  longitude: number;
  radius: number;
  timeFrame: number;
  maxResults: number;
  sqftMin?: number;
  sqftMax?: number;
  bedsMin?: number;
  bedsMax?: number;
}

const finiteOrNull = (value: number | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;

/**
 * Stable, deliberately versioned key for the paid comparables cache.
 * Coordinates are rounded to roughly 10 m so repeated underwriting for the
 * same parcel reuses the response despite insignificant coordinate drift.
 */
export function realieCompCacheKey(input: RealieCompCacheInput): string {
  const parts = [
    "v1",
    input.latitude.toFixed(4),
    input.longitude.toFixed(4),
    input.radius,
    input.timeFrame,
    input.maxResults,
    finiteOrNull(input.sqftMin),
    finiteOrNull(input.sqftMax),
    finiteOrNull(input.bedsMin),
    finiteOrNull(input.bedsMax),
  ];
  return parts.join("|");
}

export function isUnexpiredCacheEntry(
  entry: { expires_at?: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!entry?.expires_at) return false;
  const expiresAt = Date.parse(entry.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
