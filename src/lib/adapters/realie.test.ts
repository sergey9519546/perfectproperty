import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  realieDateToIsoDate,
  realieLocationSearch,
  realieLookupAddress,
  realiePropertySearchPage,
  realieToDeedRows,
  realieToDistressRows,
  realieToParcelRow,
} from "./realie";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: rpcMock },
}));

describe("Realie adapter", () => {
  beforeEach(() => {
    vi.stubEnv("REALIE_API_KEY", "unit-test-key");
    rpcMock.mockReset();
    rpcMock.mockImplementation(async (name: string) =>
      name === "reserve_realie_call" ? { data: true, error: null } : { data: null, error: null },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes stable parcel fields without discarding the raw object", () => {
    const property = {
      parcelId: " 12-345 ",
      address: "123 Main St",
      state: "fl",
      city: "Miami",
      zipCode: "33101",
      fipsState: "12",
      fipsCounty: "086",
      buildingArea: 1_650,
      acres: 0.25,
      stories: 2,
      ownershipStartDate: "20230505",
      ownerName: "Main Street Holdings LLC",
      ownerState: "OH",
      totalAssessedValue: 250_000,
      equityCurrentEstBal: 125_000,
      providerSpecificField: { retained: true },
    };

    const row = realieToParcelRow(property);

    expect(row).toMatchObject({
      apn: "12-345",
      county_fips: "12086",
      state: "FL",
      living_sqft: 1_650,
      lot_sqft: 10_890,
      stories: 2,
      owner_since: "2023-05-05",
      owner_is_absentee: true,
      owner_is_corporate: true,
      assessed_value: 250_000,
      estimated_equity: 125_000,
    });
    // The caller still owns the untouched provider object for JSONB snapshots.
    expect(property.providerSpecificField).toEqual({ retained: true });
  });

  it("refuses to invent an APN when Realie omits parcel identity", () => {
    expect(realieToParcelRow({ address: "123 Main St", state: "FL" })).toBeNull();
  });

  it("normalizes strict dates and rejects rollover dates", () => {
    expect(realieDateToIsoDate("20240131")).toBe("2024-01-31");
    expect(realieDateToIsoDate("2024-01-31T12:00:00.000Z")).toBe("2024-01-31");
    expect(realieDateToIsoDate("20240231")).toBeNull();
  });

  it("deduplicates current and historical transfers using provider fields", () => {
    const rows = realieToDeedRows({
      parcelId: "APN-1",
      recordingDate: "20240505",
      transferDate: "20240430",
      transferPrice: 420_000,
      transferDocType: "WD",
      transferDocNum: "2024R100",
      transfers: [
        {
          recordingDate: "20240505",
          transferDateObject: "2024-04-30T00:00:00.000Z",
          transferPrice: 420_000,
          transferDocType: "WD",
          transferDocNum: "2024R100",
          grantee: "BUYER ONE",
          grantor: "SELLER ONE",
        },
        {
          recordingDate: "20160505",
          transferPrice: 270_000,
          grantee: "OLDER BUYER",
          grantor: "OLDER SELLER",
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source_key: "REALIE|APN-1|DOC|2024R100",
      recorded_at: "2024-05-05",
      deed_type: "WD",
      sale_price: 420_000,
      loan_amount: null,
    });
    expect(rows[1]).toMatchObject({
      recorded_at: "2016-05-05",
      buyer: "OLDER BUYER",
      seller: "OLDER SELLER",
    });
  });

  it("creates explicit foreclosure events but not false tax-lien distress", () => {
    expect(
      realieToDistressRows({
        parcelId: "APN-1",
        totalLienCount: 2,
        totalLienBalance: 300_000,
      }),
    ).toEqual([]);

    const rows = realieToDistressRows({
      parcelId: "APN-1",
      forecloseCode: "0111",
      forecloseFileDate: "20240110",
      forecloseCaseNum: "CASE-7",
      auctionDate: "2024-03-01",
      totalLienCount: 2,
      totalLienBalance: 300_000,
    });
    expect(rows.map((row) => row.event_type)).toEqual(["FORECLOSURE_NOD", "AUCTION_SCHEDULED"]);
    expect(rows[0].details.total_lien_balance).toBe(300_000);
    expect(rows[1].auction_date).toBe("2024-03-01");
  });

  it("does not fetch when the atomic budget reservation is denied", async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      realieLocationSearch({
        latitude: 25.7,
        longitude: -80.2,
        budgetClass: "background",
      }),
    ).rejects.toMatchObject({
      code: "REALIE_BUDGET_EXHAUSTED",
      budgetClass: "background",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds search parameters, preserves raw fields, and records the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: [
            {
              parcelId: "APN-1",
              address: "1 Main St",
              state: "CA",
              futureRealieField: "kept",
            },
          ],
          metadata: { count: 1, nextCursor: "next-page" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await realiePropertySearchPage({
      state: "CA",
      county: "Los Angeles",
      limit: 999,
      residential: false,
      cursor: "current-page",
      budgetClass: "background",
    });

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.pathname).toBe("/api/public/property/search/");
    expect(requested.searchParams.get("limit")).toBe("100");
    expect(requested.searchParams.get("residential")).toBe("false");
    expect(requested.searchParams.get("cursor")).toBe("current-page");
    expect(page.metadata?.nextCursor).toBe("next-page");
    expect(page.properties[0].futureRealieField).toBe("kept");
    expect(rpcMock).toHaveBeenCalledWith("record_realie_call_result", {
      p_endpoint: "/public/property/search/",
      p_success: true,
      p_property_count: 1,
    });
  });

  it("reserves and records every paid retry attempt", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporary" }), {
          status: 500,
          statusText: "Internal Server Error",
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ property: { parcelId: "APN-2", address: "2 Main St", state: "OH" } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      realieLookupAddress({ address: "2 Main St", state: "OH", budgetClass: "interactive" }),
    ).resolves.toMatchObject({ parcelId: "APN-2" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls.filter(([name]) => name === "reserve_realie_call")).toHaveLength(2);
    expect(rpcMock).toHaveBeenCalledWith("record_realie_call_result", {
      p_endpoint: "/public/property/address/",
      p_success: false,
      p_property_count: 0,
    });
    expect(rpcMock).toHaveBeenCalledWith("record_realie_call_result", {
      p_endpoint: "/public/property/address/",
      p_success: true,
      p_property_count: 1,
    });
  });
});
