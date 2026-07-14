/**
 * Plain (non-server-fn) parcel helpers, safe to call from server functions and
 * cron workers. Realie fetching, raw-response caching, parcel normalization,
 * and underwriting are intentionally separate so a background enrichment run
 * never spends a premium-comparables credit per parcel.
 */
import { createHash } from "node:crypto";
import {
  realieLookupAddress,
  realiePropertySearch,
  realieToDeedRows,
  realieToDistressRows,
  realieToParcelRow,
  type RealieProperty,
} from "@/lib/adapters/realie";
import { matchRealieProperties, realieLookupKey } from "@/lib/realie-batch";

export type LookupArgs = {
  address: string;
  state: string;
  city?: string;
  county?: string;
  unit?: string;
  existingParcelId?: string;
  underwrite?: boolean;
  budgetClass?: "background" | "interactive";
};

export type PersistRealiePropertyArgs = {
  existingParcelId?: string;
  fallbackState?: string;
  county?: string;
  endpoint: string;
  matchMethod: string;
  lookupKey?: string;
  persistSnapshot?: boolean;
};

const SNAPSHOT_TTL_DAYS = 90;
const NEGATIVE_CACHE_TTL_DAYS = 30;
let ttlCache: { propertyDays: number; negativeDays: number; loadedAt: number } | undefined;

function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function realieCacheTtls(): Promise<{ propertyDays: number; negativeDays: number }> {
  if (ttlCache && Date.now() - ttlCache.loadedAt < 5 * 60 * 1000) return ttlCache;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("orchestrator_config")
    .select("realie_property_cache_ttl_days,realie_negative_cache_ttl_days")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.warn("Realie cache TTL config read failed:", error.message);
  const clamp = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(365, Math.max(1, Math.floor(parsed))) : fallback;
  };
  ttlCache = {
    propertyDays: clamp(data?.realie_property_cache_ttl_days, SNAPSHOT_TTL_DAYS),
    negativeDays: clamp(data?.realie_negative_cache_ttl_days, NEGATIVE_CACHE_TTL_DAYS),
    loadedAt: Date.now(),
  };
  return ttlCache;
}

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function readRealieSnapshotCore(args: {
  parcelId?: string;
  lookupKey?: string;
}): Promise<RealieProperty | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = (supabaseAdmin as any).from("realie_property_snapshots");
  const now = new Date().toISOString();

  if (args.parcelId) {
    const { data, error } = await table
      .select("payload")
      .eq("parcel_id", args.parcelId)
      .gt("expires_at", now)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to read Realie snapshot: ${error.message}`);
    if (data?.payload) return data.payload as RealieProperty;
  }

  if (args.lookupKey) {
    const { data, error } = await (supabaseAdmin as any)
      .from("realie_property_snapshots")
      .select("payload")
      .eq("lookup_key", args.lookupKey)
      .gt("expires_at", now)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to read Realie snapshot: ${error.message}`);
    if (data?.payload) return data.payload as RealieProperty;
  }

  return null;
}

export async function isRealieNegativeCachedCore(lookupKey: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("realie_negative_cache")
    .select("lookup_key, hit_count")
    .eq("lookup_key", lookupKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Failed to read Realie negative cache: ${error.message}`);
  if (data) {
    // Best-effort telemetry; a lost increment under concurrency cannot affect
    // the cache decision or credit safety.
    await (supabaseAdmin as any)
      .from("realie_negative_cache")
      .update({ hit_count: Number(data.hit_count ?? 0) + 1 })
      .eq("lookup_key", lookupKey);
  }
  return Boolean(data);
}

export async function cacheRealieMissCore(
  lookupKey: string,
  reason = "address_not_found",
  statusCode = 404,
  endpoint = "/public/property/address/",
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { negativeDays } = await realieCacheTtls();
  const { error } = await (supabaseAdmin as any).from("realie_negative_cache").upsert(
    {
      lookup_key: lookupKey,
      endpoint,
      reason,
      status_code: statusCode,
      fetched_at: new Date().toISOString(),
      expires_at: futureIso(negativeDays),
    },
    { onConflict: "lookup_key" },
  );
  if (error) throw new Error(`Failed to write Realie negative cache: ${error.message}`);
}

async function persistRealieSnapshot(
  parcelId: string,
  property: RealieProperty,
  args: PersistRealiePropertyArgs,
): Promise<void> {
  const providerParcelId = String(property.parcelId ?? "").trim();
  if (!providerParcelId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fetchedAt = new Date().toISOString();
  const { propertyDays } = await realieCacheTtls();
  const { error } = await (supabaseAdmin as any).from("realie_property_snapshots").upsert(
    {
      provider_parcel_id: providerParcelId,
      parcel_id: parcelId,
      lookup_key: args.lookupKey ?? null,
      payload: property,
      payload_hash: payloadHash(property),
      endpoint: args.endpoint,
      match_method: args.matchMethod,
      fetched_at: fetchedAt,
      expires_at: futureIso(propertyDays),
    },
    { onConflict: "provider_parcel_id" },
  );
  if (error) throw new Error(`Failed to cache Realie snapshot: ${error.message}`);
}

/** Normalize and merge a full Realie response without making another API call. */
export async function persistRealiePropertyCore(
  property: RealieProperty,
  args: PersistRealiePropertyArgs,
): Promise<{ parcel_id: string }> {
  const row = realieToParcelRow(property, args.fallbackState?.toUpperCase());
  if (!row) throw new Error("Realie returned insufficient data for this address");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let matchId: string | null = null;
  if (row.apn && row.county_fips) {
    const result = await (supabaseAdmin as any).rpc("match_parcel", {
      _county_fips: row.county_fips,
      _apn: row.apn,
      _address: row.address,
      _city: row.city,
    });
    if (result.error) throw new Error(`Failed to match parcel: ${result.error.message}`);
    matchId = (result.data as string | null) ?? null;
  }

  let parcelId: string | null = args.existingParcelId ?? matchId;
  if (parcelId) {
    // A sparse provider response must not erase better values already stored.
    const patch = Object.fromEntries(
      Object.entries(row).filter(
        ([, value]) => value !== null && value !== undefined && value !== "",
      ),
    );
    // Keep the source parcel's APN immutable. Realie's provider identifier is
    // retained in the snapshot and must not replace a county spider's APN.
    delete patch.apn;
    const { error } = await supabaseAdmin
      .from("parcels")
      .update(patch as any)
      .eq("id", parcelId);
    if (error) throw new Error(`Failed to update parcel: ${error.message}`);
  } else {
    const missing = ["apn", "county_fips", "city", "zip", "lat", "lng"].filter(
      (field) => row[field] === null || row[field] === undefined || row[field] === "",
    );
    if (missing.length) {
      throw new Error(`Realie returned insufficient location data: ${missing.join(", ")}`);
    }
    const { error: countyError } = await supabaseAdmin.from("counties").upsert(
      {
        fips: row.county_fips,
        state: row.state,
        name: args.county?.trim() || property.county?.trim() || `County ${row.county_fips}`,
        center_lat: row.lat,
        center_lng: row.lng,
      },
      { onConflict: "fips", ignoreDuplicates: true },
    );
    if (countyError) throw new Error(`Failed to ensure county: ${countyError.message}`);
    const { data: inserted, error } = await supabaseAdmin
      .from("parcels")
      .upsert(row, { onConflict: "county_fips,apn" })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to upsert parcel");
    parcelId = inserted.id;
  }

  // Stamp per-field provenance for every non-null field Realie provided.
  try {
    const { writeProvenance, DEFAULT_CONFIDENCE } = await import("@/lib/provenance.server");
    const conf = DEFAULT_CONFIDENCE.REALIE;
    const observedAt = new Date().toISOString();
    const provFields: Array<keyof typeof row> = [
      "living_sqft",
      "year_built",
      "bedrooms",
      "bathrooms",
      "lot_sqft",
      "assessed_value",
      "owner_name",
      "property_type",
      "lat",
      "lng",
      "condition_grade",
      "flood_zone",
    ] as any;
    const entries = provFields
      .filter((field) => row[field] !== null && row[field] !== undefined)
      .map((field) => ({
        field: (field === "bedrooms"
          ? "beds"
          : field === "bathrooms"
            ? "baths"
            : String(field)) as any,
        value: row[field],
        confidence: conf,
        source: "REALIE",
        observed_at: observedAt,
      }));
    if (entries.length) await writeProvenance(parcelId!, entries);
  } catch (error) {
    console.warn("provenance write (realie) failed:", (error as Error).message);
  }

  if (args.persistSnapshot !== false) {
    await persistRealieSnapshot(parcelId!, property, args);
  }

  // Project provider history into the existing deal tables while keeping the
  // complete response in the snapshot. Stable provider-derived keys make a
  // refreshed snapshot idempotent.
  try {
    const deedRows = realieToDeedRows(property).map(({ source_key, ...deed }) => ({
      ...deed,
      parcel_id: parcelId!,
      source_event_id: source_key,
    }));
    if (deedRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("deeds")
        .upsert(deedRows as any, { onConflict: "data_source,source_event_id" });
      if (error) throw error;
    }

    const distressRows = realieToDistressRows(property).map((event) => ({
      ...event,
      parcel_id: parcelId!,
    }));
    if (distressRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("distress_events")
        .upsert(distressRows as any, { onConflict: "data_source,source_event_id" });
      if (error) throw error;
    }
  } catch (error) {
    // The raw snapshot remains authoritative and can be replayed after a
    // migration/constraint issue is repaired.
    console.warn("Realie transfer/distress projection failed:", (error as Error).message);
  }

  if (args.lookupKey) {
    await (supabaseAdmin as any)
      .from("realie_negative_cache")
      .delete()
      .eq("lookup_key", args.lookupKey);
  }

  return { parcel_id: parcelId! };
}

export async function lookupParcelByAddressCore(args: LookupArgs) {
  const state = args.state.trim().toUpperCase();
  const lookupKey = realieLookupKey({
    address: args.address,
    state,
    city: args.city,
    county: args.county,
    unit: args.unit,
  });

  if (await isRealieNegativeCachedCore(lookupKey)) {
    throw new Error("Address not found in Realie (cached)");
  }

  let property = await readRealieSnapshotCore({
    parcelId: args.existingParcelId,
    lookupKey,
  });
  let endpoint = "cache";
  let matchMethod = "snapshot";
  let persistSnapshot = false;

  if (!property) {
    persistSnapshot = true;
    if (args.city && !args.county) {
      // Realie's address endpoint rejects city without county. The property
      // search endpoint accepts that combination, so use an exact-address
      // search instead of sending a malformed request.
      endpoint = "/public/property/search/";
      matchMethod = "exact_property_search";
      const properties = await realiePropertySearch({
        address: args.address,
        state,
        city: args.city,
        limit: 10,
        budgetClass: args.budgetClass ?? "interactive",
      });
      property =
        matchRealieProperties(
          [
            {
              parcel_id: args.existingParcelId ?? "address-lookup",
              address: args.address,
              city: args.city,
              state,
            },
          ],
          properties,
        )
          .values()
          .next().value ?? null;
    } else {
      endpoint = "/public/property/address/";
      matchMethod = "exact_address";
      property = await realieLookupAddress({
        address: args.address,
        state,
        unitNumberStripped: args.unit,
        city: args.county ? args.city : undefined,
        county: args.county,
        budgetClass: args.budgetClass ?? "interactive",
      });
    }
  }

  if (!property) {
    await cacheRealieMissCore(lookupKey, "address_not_found", 404, endpoint);
    throw new Error("Address not found in Realie");
  }

  const persisted = await persistRealiePropertyCore(property, {
    existingParcelId: args.existingParcelId,
    fallbackState: state,
    county: args.county,
    endpoint,
    matchMethod,
    lookupKey,
    persistSnapshot,
  });

  if (!args.underwrite) return persisted;
  const { rerunUnderwriteCore } = await import("@/lib/underwrite-core");
  const result = await rerunUnderwriteCore(persisted.parcel_id, {
    allowPremiumComps: true,
    budgetClass: args.budgetClass ?? "interactive",
  });
  return { ...persisted, ...result };
}
