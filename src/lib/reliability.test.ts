import { describe, expect, it } from "vitest";
import { marketContextForCounty, DEFAULT_MARKET_CONTEXT, MARKET_CONTEXT } from "./engine";
import { realieToParcelRow } from "./adapters/realie";
import { shouldOverwrite } from "./provenance.server";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("allows internal paths", () => {
    expect(safeNext("/deals?ring=2")).toBe("/deals?ring=2");
  });

  it("rejects protocol-relative and backslash redirects", () => {
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
  });
});

describe("marketContextForCounty", () => {
  it("uses one shared fallback for unknown counties", () => {
    expect(marketContextForCounty("99999")).toBe(DEFAULT_MARKET_CONTEXT);
  });

  it("preserves configured county assumptions", () => {
    expect(marketContextForCounty("06037")).toBe(MARKET_CONTEXT["06037"]);
  });
});

describe("Realie normalization", () => {
  it("keeps unverified underwriting fields unknown", () => {
    const row = realieToParcelRow({
      parcelId: "abc",
      address: "1 Main St",
      state: "FL",
      city: "Miami",
      zipCode: "33101",
      latitude: 25.7,
      longitude: -80.2,
      yearBuilt: 1950,
    });

    expect(row.condition_grade).toBeNull();
    expect(row.flood_zone).toBeNull();
    expect(row.school_score).toBeNull();
    expect(row.property_type).toBeNull();
    expect(row.is_listed).toBeNull();
    expect(row.is_vacant).toBeNull();
    expect(row.county_fips).toBeNull();
  });
});

describe("provenance overwrite policy", () => {
  const existing = { confidence: 0.9, observed_at: "2026-01-01T00:00:00.000Z" };

  it("accepts higher confidence", () => {
    expect(
      shouldOverwrite({ confidence: 0.95, observed_at: "2026-01-02T00:00:00.000Z" }, existing),
    ).toBe(true);
  });

  it("rejects lower confidence unless more than 90 days newer", () => {
    expect(
      shouldOverwrite({ confidence: 0.8, observed_at: "2026-02-01T00:00:00.000Z" }, existing),
    ).toBe(false);
    expect(
      shouldOverwrite({ confidence: 0.8, observed_at: "2026-05-01T00:00:00.000Z" }, existing),
    ).toBe(true);
  });
});
