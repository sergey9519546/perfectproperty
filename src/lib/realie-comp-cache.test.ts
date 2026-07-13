import { describe, expect, it } from "vitest";
import { isUnexpiredCacheEntry, realieCompCacheKey } from "./realie-comp-cache";

describe("realieCompCacheKey", () => {
  const base = {
    latitude: 34.123456,
    longitude: -118.456789,
    radius: 1,
    timeFrame: 18,
    maxResults: 12,
    sqftMin: 1_000,
    sqftMax: 1_800,
    bedsMin: 2,
    bedsMax: 4,
  };

  it("is stable across insignificant coordinate drift", () => {
    expect(realieCompCacheKey(base)).toBe(
      realieCompCacheKey({ ...base, latitude: 34.123459, longitude: -118.456791 }),
    );
  });

  it("separates materially different comp filters", () => {
    expect(realieCompCacheKey(base)).not.toBe(realieCompCacheKey({ ...base, timeFrame: 12 }));
    expect(realieCompCacheKey(base)).not.toBe(realieCompCacheKey({ ...base, sqftMax: 2_000 }));
  });
});

describe("isUnexpiredCacheEntry", () => {
  const now = Date.parse("2026-07-13T12:00:00.000Z");

  it("accepts only valid future expirations", () => {
    expect(isUnexpiredCacheEntry({ expires_at: "2026-07-14T00:00:00.000Z" }, now)).toBe(true);
    expect(isUnexpiredCacheEntry({ expires_at: "2026-07-13T11:59:59.000Z" }, now)).toBe(false);
    expect(isUnexpiredCacheEntry({ expires_at: null }, now)).toBe(false);
  });
});
