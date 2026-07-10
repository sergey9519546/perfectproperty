/**
 * Pure helpers for ARV selection and Realie comps top-up decisions.
 * Isolated so they can be unit-tested without touching Supabase or fetch.
 */

export type Scope = "COSMETIC" | "FULL" | "EXPANDED" | null | undefined;

export interface ArvBundle {
  recommended_scope?: Scope;
  cosmetic_arv?: number | null;
  full_reno_arv?: number | null;
  expanded_arv?: number | null;
  as_is_value?: number | null;
}

/**
 * Pick the display ARV for a scored parcel.
 *
 * Order of precedence:
 *   1. The ARV that matches the recommended scope (if present AND > 0)
 *   2. full_reno_arv
 *   3. cosmetic_arv
 *   4. as_is_value
 *   5. 0
 */
export function pickArv(r: ArvBundle): number {
  const num = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const scoped =
    r.recommended_scope === "COSMETIC" ? num(r.cosmetic_arv) :
    r.recommended_scope === "FULL" ? num(r.full_reno_arv) :
    r.recommended_scope === "EXPANDED" ? num(r.expanded_arv) :
    0;
  return scoped || num(r.full_reno_arv) || num(r.cosmetic_arv) || num(r.as_is_value) || 0;
}

/**
 * The Realie premium-comps API is a paid endpoint. We should only call it as a
 * TOP-UP when the local comps returned by pick_comps are too thin to trust —
 * defined as strictly fewer than 3 rows. Additionally requires lat/lng and an
 * API key to be present.
 */
export const REALIE_TOP_UP_THRESHOLD = 3;

export function shouldTopUpWithRealie(args: {
  localCompCount: number;
  hasLatLng: boolean;
  hasApiKey: boolean;
}): boolean {
  return (
    args.localCompCount < REALIE_TOP_UP_THRESHOLD &&
    args.hasLatLng &&
    args.hasApiKey
  );
}
