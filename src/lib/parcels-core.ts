/**
 * Plain (non-server-fn) parcel helpers, safe to call from other server
 * functions or cron workers. Extracted so bulk_lookup_items processing
 * doesn't have to invoke a `createServerFn` handler (which is unreliable
 * outside an HTTP request context and gets rewritten by the split
 * transform).
 */
import { realieLookupAddress, realieToParcelRow } from "@/lib/adapters/realie";

export type LookupArgs = {
  address: string;
  state: string;
  city?: string;
  county?: string;
  unit?: string;
};

export async function lookupParcelByAddressCore(args: LookupArgs) {
  const property = await realieLookupAddress({
    address: args.address,
    state: args.state.toUpperCase(),
    city: args.city,
    county: args.county,
    unitNumberStripped: args.unit,
  });
  if (!property) throw new Error("Address not found in Realie");

  const row = realieToParcelRow(property, args.state.toUpperCase());
  if (!row) throw new Error("Realie returned insufficient data for this address");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: matchId } = await (supabaseAdmin as any).rpc("match_parcel", {
    _county_fips: row.county_fips,
    _apn: row.apn,
    _address: row.address,
    _city: row.city,
  });

  let parcelId: string | null = (matchId as string | null) ?? null;
  if (parcelId) {
    await supabaseAdmin.from("parcels").update(row).eq("id", parcelId);
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from("parcels")
      .upsert(row, { onConflict: "county_fips,apn" })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to upsert parcel");
    parcelId = inserted.id;
  }

  // Stamp per-field provenance for every non-null field Realie provided so
  // "Why this score" can attribute each input back to its source.
  try {
    const { writeProvenance, DEFAULT_CONFIDENCE } = await import("@/lib/provenance.server");
    const conf = DEFAULT_CONFIDENCE.REALIE;
    const observedAt = new Date().toISOString();
    const provFields: Array<keyof typeof row> = [
      "living_sqft", "year_built", "bedrooms", "bathrooms", "lot_sqft",
      "assessed_value", "owner_name", "property_type", "lat", "lng",
      "condition_grade", "flood_zone",
    ] as any;
    const entries = provFields
      .filter((f) => (row as any)[f] !== null && (row as any)[f] !== undefined)
      .map((f) => ({
        field: (f === "bedrooms" ? "beds" : f === "bathrooms" ? "baths" : String(f)) as any,
        value: (row as any)[f],
        confidence: conf,
        source: "REALIE",
        observed_at: observedAt,
      }));
    if (entries.length) await writeProvenance(parcelId!, entries);
  } catch (e) {
    console.warn("provenance write (realie) failed:", (e as Error).message);
  }

  const { rerunUnderwriteCore } = await import("@/lib/underwrite-core");
  const result = await rerunUnderwriteCore(parcelId!);
  return { parcel_id: parcelId!, ...result };
}
