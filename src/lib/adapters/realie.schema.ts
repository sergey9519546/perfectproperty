/**
 * Zod schemas for Realie API responses and normalized frontend payloads.
 *
 * Realie can add provider-specific fields at any time, so raw response
 * schemas are permissive (`.loose()` / passthrough) and every documented
 * field is optional + nullable. The normalized payload schema is strict —
 * we validate what leaves our server for the browser.
 */
import { z } from "zod";
import type { RealieComp, RealieProperty, RealieSearchMetadata } from "./realie";

const nullableString = z.string().nullish();
const nullableNumber = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
});
const nullableBool = z.boolean().nullish();

const AssessmentSchema = z.looseObject({
  assessedYear: nullableNumber,
  totalAssessedValue: nullableNumber,
  totalBuildingValue: nullableNumber,
  totalLandValue: nullableNumber,
  totalMarketValue: nullableNumber,
  marketValueYear: nullableNumber,
  taxValue: nullableNumber,
  taxYear: nullableNumber,
});

const TransferSchema = z.looseObject({
  recordingDate: nullableString,
  transferDate: nullableString,
  transferDateObject: nullableString,
  transferPrice: nullableNumber,
  grantee: nullableString,
  grantor: nullableString,
});

const GeoPointSchema = z.looseObject({
  type: z.literal("Point").optional(),
  coordinates: z.array(z.number()).optional(),
});

const GeoPolygonSchema = z.looseObject({
  type: z.enum(["MultiPolygon", "Polygon"]).optional(),
  coordinates: z.unknown().optional(),
});

/**
 * Permissive schema for a raw Realie property. Unknown keys pass through so
 * the raw snapshot cache stays lossless; documented keys are coerced to safe
 * types. Use `safeParseRealieProperty` at boundaries — never `.parse` — so
 * an upstream provider change never takes the pipeline down.
 */
export const RealiePropertySchema = z
  .looseObject({
    parcelId: nullableString,
    address: nullableString,
    addressFull: nullableString,
    city: nullableString,
    state: nullableString,
    county: nullableString,
    zip: nullableString,
    zipCode: nullableString,

    propertyType: nullableString,
    buildingArea: nullableNumber,
    yearBuilt: nullableNumber,
    totalBedrooms: nullableNumber,
    beds: nullableNumber,
    totalBathrooms: nullableNumber,
    baths: nullableNumber,
    acres: nullableNumber,
    landArea: nullableNumber,

    ownerName: nullableString,
    ownerAddressLine1: nullableString,
    ownerCity: nullableString,
    ownerState: nullableString,
    ownerZipCode: nullableString,

    totalAssessedValue: nullableNumber,
    taxValue: nullableNumber,
    totalMarketValue: nullableNumber,
    modelValue: nullableNumber,
    equityCurrentEstBal: nullableNumber,
    LTVCurrentEstCombined: nullableNumber,

    lastSalePrice: nullableNumber,
    transferPrice: nullableNumber,
    transferDate: nullableString,
    transferDateObject: nullableString,
    recordingDate: nullableString,

    forecloseCode: nullableString,
    forecloseRecordDate: nullableString,
    forecloseFileDate: nullableString,
    forecloseCaseNum: nullableString,
    auctionDate: nullableString,

    latitude: nullableNumber,
    longitude: nullableNumber,
    fipsState: nullableString,
    fipsCounty: nullableString,

    residential: nullableBool,
    pool: nullableBool,

    assessments: z.array(AssessmentSchema).nullish(),
    transfers: z.array(TransferSchema).nullish(),
    location: GeoPointSchema.nullish(),
    point: GeoPointSchema.nullish(),
    geometry: GeoPolygonSchema.nullish(),
    polygon: GeoPolygonSchema.nullish(),
  });

/**
 * Validate a raw Realie property record. On failure returns `null` and logs
 * a warning — Realie can add or rename fields without notice, so we prefer
 * graceful degradation over hard failures at the adapter boundary.
 */
export function safeParseRealieProperty(raw: unknown): RealieProperty | null {
  if (!raw || typeof raw !== "object") return null;
  const result = RealiePropertySchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      "Realie response failed schema validation:",
      result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
    return null;
  }
  return result.data as unknown as RealieProperty;
}

// ---------- Comp + search metadata ----------

export const RealieCompSchema = z.looseObject({
  parcelId: nullableString,
  address: nullableString,
  addressFull: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  buildingArea: nullableNumber,
  totalBedrooms: nullableNumber,
  totalBathrooms: nullableNumber,
  transferPrice: nullableNumber,
  lastSalePrice: nullableNumber,
  transferDateObject: nullableString,
});

export const RealieSearchMetadataSchema = z.looseObject({
  limit: nullableNumber,
  count: nullableNumber,
  nextCursor: nullableString,
  offset: nullableNumber,
  deprecationNotice: nullableString,
});

function warn(label: string, issues: z.ZodIssue[]) {
  console.warn(
    `${label} failed schema validation:`,
    issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  );
}

/** Validate an array of raw Realie properties; drops individual invalid rows. */
export function safeParseRealieProperties(raw: unknown): RealieProperty[] {
  if (!Array.isArray(raw)) return [];
  const out: RealieProperty[] = [];
  for (const item of raw) {
    const parsed = safeParseRealieProperty(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Validate an array of raw Realie comps; drops individual invalid rows. */
export function safeParseRealieComps(raw: unknown): RealieComp[] {
  if (!Array.isArray(raw)) return [];
  const out: RealieComp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const result = RealieCompSchema.safeParse(item);
    if (result.success) out.push(result.data as unknown as RealieComp);
    else warn("Realie comp", result.error.issues);
  }
  return out;
}

/** Validate Realie search metadata; returns null when the shape is invalid. */
export function safeParseRealieSearchMetadata(raw: unknown): RealieSearchMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const result = RealieSearchMetadataSchema.safeParse(raw);
  if (!result.success) {
    warn("Realie search metadata", result.error.issues);
    return null;
  }
  return result.data as unknown as RealieSearchMetadata;
}

// ---------- Normalized frontend payload ----------

const ParcelSchema = z
  .object({
    id: z.string(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    county_fips: z.string().nullable(),
    state: z.string().nullable(),
    zip: z.string().nullable(),
    apn: z.string().nullable(),
    owner_name: z.string().nullable(),
    owner_is_absentee: z.boolean().nullable(),
    owner_is_corporate: z.boolean().nullable(),
    owner_since: z.string().nullable(),
    living_sqft: z.number().nullable(),
    year_built: z.number().nullable(),
    bedrooms: z.number().nullable(),
    bathrooms: z.number().nullable(),
    lot_sqft: z.number().nullable(),
    property_type: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    assessed_value: z.number().nullable(),
    estimated_equity: z.number().nullable(),
    is_listed: z.boolean().nullable(),
    is_vacant: z.boolean().nullable(),
    condition_grade: z.union([z.string(), z.number()]).nullable(),
    updated_at: z.string().nullable(),
  })
  .partial();

const ScoreSchema = z
  .object({
    perfect_score: z.number().nullable(),
    arv_today: z.number().nullable(),
    modeled_offer: z.number().nullable(),
    risk_adjusted_profit: z.number().nullable(),
    ring: z.number().nullable(),
    confidence_grade: z.string().nullable(),
    score_confidence: z.number().nullable(),
    computed_at: z.string().nullable(),
  })
  .partial();

export const NormalizedPropertyLookupSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    parcel_id: z.string(),
    parcel: ParcelSchema.nullable(),
    score: ScoreSchema.nullable(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export type NormalizedPropertyLookup = z.infer<typeof NormalizedPropertyLookupSchema>;
