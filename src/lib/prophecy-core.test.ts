import { describe, it, expect, vi } from "vitest";
import { runProphecyQuery, PROPHECY_SELECT } from "./prophecy-core";

/**
 * Chainable Supabase spy. Every filter/order/limit call records itself and
 * returns the same object so `await q` resolves with the seeded rows.
 * `rpc` is a top-level spy — prophecy MUST NOT call it, so any invocation
 * flunks the "no active-trigger dependency" tests.
 */
function makeSpySupabase(rows: any[] = []) {
  const calls: Array<{ method: string; args: any[] }> = [];
  const rpc = vi.fn();
  const chain: any = {
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  const record =
    (method: string) =>
    (...args: any[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of ["select", "eq", "neq", "gte", "lte", "gt", "lt", "in", "not", "or", "order", "limit", "range"]) {
    chain[m] = record(m);
  }
  const supabase = { from: vi.fn(() => chain), rpc };
  return { supabase, calls, rpc, chain };
}

const defaultInput = { min_score: 15, limit: 200 };

describe("runProphecyQuery — unlisted-parcel filtering", () => {
  it("selects from parcel_scores and joins parcels", async () => {
    const { supabase, calls } = makeSpySupabase([]);
    await runProphecyQuery(supabase, defaultInput);
    expect(supabase.from).toHaveBeenCalledWith("parcel_scores");
    const select = calls.find((c) => c.method === "select");
    expect(select).toBeDefined();
    expect(select!.args[0]).toBe(PROPHECY_SELECT);
    expect(select!.args[0]).toContain("parcels!inner");
  });

  it("filters is_listed=false so on-market parcels are excluded", async () => {
    const { supabase, calls } = makeSpySupabase([]);
    await runProphecyQuery(supabase, defaultInput);
    const listedFilter = calls.find(
      (c) => c.method === "eq" && c.args[0] === "parcels.is_listed",
    );
    expect(listedFilter).toBeDefined();
    expect(listedFilter!.args[1]).toBe(false);
  });

  it("requires real underwriting inputs (living_sqft + year_built non-null)", async () => {
    const { supabase, calls } = makeSpySupabase([]);
    await runProphecyQuery(supabase, defaultInput);
    const notCalls = calls.filter((c) => c.method === "not");
    const cols = notCalls.map((c) => c.args[0]);
    expect(cols).toContain("parcels.living_sqft");
    expect(cols).toContain("parcels.year_built");
    for (const c of notCalls) {
      expect(c.args[1]).toBe("is");
      expect(c.args[2]).toBeNull();
    }
  });

  it("restricts to LIVE data source and applies min_score / limit / ordering", async () => {
    const { supabase, calls } = makeSpySupabase([]);
    await runProphecyQuery(supabase, { min_score: 25, limit: 42 });
    expect(calls).toContainEqual({ method: "eq", args: ["data_source", "LIVE"] });
    expect(calls).toContainEqual({ method: "gte", args: ["perfect_score", 25] });
    expect(calls).toContainEqual({ method: "limit", args: [42] });
    const orders = calls.filter((c) => c.method === "order");
    expect(orders[0].args).toEqual(["ring", { ascending: false }]);
    expect(orders[1].args).toEqual(["perfect_score", { ascending: false }]);
  });

  it("applies county_fips filter only when provided", async () => {
    const a = makeSpySupabase([]);
    await runProphecyQuery(a.supabase, defaultInput);
    expect(a.calls.find((c) => c.method === "eq" && c.args[0] === "parcels.county_fips")).toBeUndefined();

    const b = makeSpySupabase([]);
    await runProphecyQuery(b.supabase, { ...defaultInput, county_fips: "12086" });
    expect(b.calls).toContainEqual({ method: "eq", args: ["parcels.county_fips", "12086"] });
  });

  it("returns rows from the spy chain", async () => {
    const fixture = [{ parcel_id: "p1", perfect_score: 30, ring: 3, parcels: { is_listed: false } }];
    const { supabase } = makeSpySupabase(fixture);
    const out = await runProphecyQuery(supabase, defaultInput);
    expect(out).toEqual(fixture);
  });

  it("returns [] when the query yields null rows", async () => {
    const { supabase, chain } = makeSpySupabase([]);
    chain.then = (resolve: any) => resolve({ data: null, error: null });
    const out = await runProphecyQuery(supabase, defaultInput);
    expect(out).toEqual([]);
  });

  it("throws when the underlying query errors", async () => {
    const { supabase, chain } = makeSpySupabase([]);
    chain.then = (resolve: any) => resolve({ data: null, error: { message: "boom" } });
    await expect(runProphecyQuery(supabase, defaultInput)).rejects.toThrow("boom");
  });
});

describe("runProphecyQuery — MUST NOT depend on active triggers", () => {
  it("never calls the parcels_with_active_trigger RPC", async () => {
    const { supabase, rpc } = makeSpySupabase([]);
    await runProphecyQuery(supabase, defaultInput);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never queries distress_events or listings tables", async () => {
    const { supabase } = makeSpySupabase([]);
    await runProphecyQuery(supabase, defaultInput);
    const tables = (supabase.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(tables).not.toContain("distress_events");
    expect(tables).not.toContain("listings");
    expect(tables).toEqual(["parcel_scores"]);
  });

  it("never narrows results with an .in('parcel_id', [...]) trigger gate", async () => {
    const { supabase, calls } = makeSpySupabase([]);
    await runProphecyQuery(supabase, defaultInput);
    const inParcelId = calls.find((c) => c.method === "in" && c.args[0] === "parcel_id");
    expect(inParcelId).toBeUndefined();
  });
});
