import { describe, expect, it } from "vitest";
import {
  buildRealieLocationBatches,
  matchRealieProperties,
  normalizeRealieAddress,
  realieLookupKey,
} from "./realie-batch";

describe("Realie batch helpers", () => {
  it("normalizes equivalent address spellings and creates stable cache keys", () => {
    expect(normalizeRealieAddress("123 North Main Street, Apt #4")).toBe("123 N MAIN ST APT 4");
    expect(
      realieLookupKey({
        address: "123 N. Main St.",
        city: "Cleveland",
        county: "Cuyahoga",
        state: "oh",
        unit: "4",
      }),
    ).toBe("123 N MAIN ST|4|CLEVELAND|CUYAHOGA|OH");
  });

  it("groups nearby parcels but does not spend a location call on a singleton", () => {
    const batches = buildRealieLocationBatches([
      { parcel_id: "a", address: "1 Main St", state: "FL", lat: 25.7617, lng: -80.1918 },
      { parcel_id: "b", address: "2 Main St", state: "FL", lat: 25.762, lng: -80.1919 },
      { parcel_id: "c", address: "9 Far St", state: "FL", lat: 26.2, lng: -80.3 },
    ]);

    expect(batches).toHaveLength(1);
    expect(batches[0].requests.map((request) => request.parcel_id)).toEqual(["a", "b"]);
    expect(batches[0].radius).toBeGreaterThanOrEqual(0.05);
  });

  it("matches APNs first and otherwise requires an exact normalized address", () => {
    const matches = matchRealieProperties(
      [
        {
          parcel_id: "request-a",
          apn: "01-23-456",
          address: "99 Wrong Rd",
          city: "Miami",
          state: "FL",
        },
        {
          parcel_id: "request-b",
          address: "20 West Market Street",
          city: "Columbus",
          state: "OH",
          zip: "43215",
        },
        {
          parcel_id: "request-c",
          address: "21 West Market Street",
          city: "Columbus",
          state: "OH",
        },
      ],
      [
        { parcelId: "0123456", address: "1 Main St", city: "Miami", state: "FL" },
        {
          parcelId: "other",
          addressFull: "20 W Market St, Columbus, OH 43215",
          address: "20 W Market St",
          city: "Columbus",
          state: "OH",
          zipCode: "43215",
        },
        { parcelId: "neighbor", address: "22 W Market St", city: "Columbus", state: "OH" },
      ],
    );

    expect(matches.get("request-a")?.parcelId).toBe("0123456");
    expect(matches.get("request-b")?.parcelId).toBe("other");
    expect(matches.has("request-c")).toBe(false);
  });
});
