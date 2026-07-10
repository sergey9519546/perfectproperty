import { describe, it, expect } from "vitest";
import { pickArv, shouldTopUpWithRealie, REALIE_TOP_UP_THRESHOLD } from "./arv-picker";

describe("pickArv — ARV fallback ordering", () => {
  it("uses the ARV matching the recommended scope when present", () => {
    expect(pickArv({ recommended_scope: "COSMETIC", cosmetic_arv: 200_000, full_reno_arv: 300_000, as_is_value: 100_000 })).toBe(200_000);
    expect(pickArv({ recommended_scope: "FULL", cosmetic_arv: 200_000, full_reno_arv: 300_000, as_is_value: 100_000 })).toBe(300_000);
    expect(pickArv({ recommended_scope: "EXPANDED", expanded_arv: 400_000, full_reno_arv: 300_000 })).toBe(400_000);
  });

  it("falls back full_reno → cosmetic → as_is when scope is missing", () => {
    expect(pickArv({ full_reno_arv: 300_000, cosmetic_arv: 200_000, as_is_value: 100_000 })).toBe(300_000);
    expect(pickArv({ cosmetic_arv: 200_000, as_is_value: 100_000 })).toBe(200_000);
    expect(pickArv({ as_is_value: 100_000 })).toBe(100_000);
  });

  it("skips zero / null / non-finite values and honors the exact fallback order", () => {
    expect(pickArv({ full_reno_arv: 0, cosmetic_arv: 250_000, as_is_value: 120_000 })).toBe(250_000);
    expect(pickArv({ full_reno_arv: null, cosmetic_arv: null, as_is_value: 120_000 })).toBe(120_000);
    expect(pickArv({ full_reno_arv: Number.NaN as any, cosmetic_arv: 250_000 })).toBe(250_000);
    expect(pickArv({})).toBe(0);
  });

  it("falls through when the scoped ARV is missing but siblings are populated", () => {
    // Scope says FULL but full_reno_arv is null → must fall back, not return 0.
    expect(pickArv({ recommended_scope: "FULL", full_reno_arv: null, cosmetic_arv: 210_000, as_is_value: 100_000 })).toBe(210_000);
  });

  it("never returns risk_adjusted_profit or a random unrelated field", () => {
    const bogus: any = { risk_adjusted_profit: 999_999, gross_profit: 888_888 };
    expect(pickArv(bogus)).toBe(0);
  });
});

describe("shouldTopUpWithRealie — threshold gate", () => {
  it("tops up ONLY when local comps < 3", () => {
    for (let n = 0; n < REALIE_TOP_UP_THRESHOLD; n++) {
      expect(shouldTopUpWithRealie({ localCompCount: n, hasLatLng: true, hasApiKey: true })).toBe(true);
    }
    for (const n of [3, 4, 5, 25]) {
      expect(shouldTopUpWithRealie({ localCompCount: n, hasLatLng: true, hasApiKey: true })).toBe(false);
    }
  });

  it("does not top up when lat/lng missing or api key missing", () => {
    expect(shouldTopUpWithRealie({ localCompCount: 0, hasLatLng: false, hasApiKey: true })).toBe(false);
    expect(shouldTopUpWithRealie({ localCompCount: 0, hasLatLng: true, hasApiKey: false })).toBe(false);
  });

  it("threshold is exactly 3 (defensive against silent widening)", () => {
    expect(REALIE_TOP_UP_THRESHOLD).toBe(3);
  });
});
