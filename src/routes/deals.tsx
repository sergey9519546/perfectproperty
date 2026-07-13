import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listRankedParcels, lookupParcelByAddress } from "@/lib/parcels.functions";
import { DossierPanel } from "@/components/DossierPanel";
import { fmt$, tierLabel, ringLabel } from "@/lib/format";
import {
  stressedDeal,
  portfolioStressLossMean,
  type StressScenario,
  type DealBase,
} from "@/lib/engine/credit";
import { pickArv } from "@/lib/arv-picker";
import { BulkLookupPanel } from "@/components/BulkLookupPanel";
import { supabase } from "@/integrations/supabase/client";
import { SectionBoundary } from "@/components/SectionBoundary";
import { DataFreshness } from "@/components/DataFreshness";

export const Route = createFileRoute("/deals")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/deals" } });
  },
  head: () => ({
    meta: [
      { title: "Ranked Deals — Perfect Property Engine" },
      {
        name: "description",
        content: "Every underwritten parcel, ranked by risk-adjusted Perfect Score.",
      },
    ],
  }),
  component: () => (
    <SectionBoundary label="Deals unavailable" minHeight={400}>
      <DealsPage />
    </SectionBoundary>
  ),
});

function DealsPage() {
  const listFn = useServerFn(listRankedParcels);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["ranked-all"],
    queryFn: () => listFn({ data: { limit: 500 } }),
  });
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <PageHead
          title="Ranked deals"
          sub="Every property we've scored, sorted by our overall buy score (0–100). Click any row to see the full breakdown — offer, profit, risks, and comps."
        />

        <HelpStrip />

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{q.data?.length ?? 0}</span>{" "}
            live scored properties
          </span>
        </div>
        <RealieLookup onCreated={(id) => setSelected(id)} />

        <BulkLookupPanel />
        <StressPanel rows={q.data ?? []} />
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-[14px]">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Property</th>
                <th
                  className="px-4 py-3 text-right"
                  title="Overall buy score, 0–100. Higher is better."
                >
                  Score
                </th>
                <th
                  className="px-4 py-3 text-left"
                  title="How we found it: on-market, off-market, or predicted to list soon."
                >
                  Source
                </th>
                <th className="px-4 py-3 text-left" title="Recommended renovation plan.">
                  Plan
                </th>
                <th className="px-4 py-3 text-right" title="What we'd offer the seller today.">
                  Our offer
                </th>
                <th
                  className="px-4 py-3 text-right"
                  title="Expected profit after all costs, at our offer."
                >
                  Expected profit
                </th>
                <th
                  className="px-4 py-3 text-right"
                  title="Middle-case profit · worst-case profit (bottom 5% of outcomes)."
                >
                  Typical · Worst case
                </th>
                <th className="px-4 py-3 text-right" title="Chance the deal loses money.">
                  Loss risk
                </th>
                <th className="px-4 py-3 text-right" title="Chance the seller accepts our offer.">
                  Deal odds
                </th>
                <th
                  className="px-4 py-3 text-right"
                  title="Expected days to sell after renovation."
                >
                  Days to sell
                </th>
                <th
                  className="px-4 py-3 text-left"
                  title="Automatic warnings that need a human look."
                >
                  Warnings
                </th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((r: any) => {
                const t = tierLabel(Number(r.perfect_score));
                const flags = (r.skeptic_flags as string[]) ?? [];
                const pLoss = Number(r.mc_p_loss);
                return (
                  <tr
                    key={r.parcel_id}
                    onClick={() => setSelected(r.parcel_id)}
                    className="cursor-pointer border-t border-border hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.parcels.address}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {r.parcels.city}, {r.parcels.state}
                      </div>
                      <DataFreshness
                        timestamp={r.computed_at}
                        prefix="Underwritten"
                        className="mt-1"
                      />
                    </td>

                    <td className="num px-4 py-3 text-right font-semibold" title={t.hint}>
                      <span style={{ color: t.color }}>{r.perfect_score}</span>
                      <div className="text-[11px] font-normal text-muted-foreground">{t.label}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px]">{ringLabel(r.ring)}</td>
                    <td className="px-4 py-3 text-[13px]">{r.recommended_scope}</td>
                    <td className="num px-4 py-3 text-right">{fmt$(Number(r.modeled_offer))}</td>
                    <td className="num px-4 py-3 text-right text-profit-strong font-medium">
                      {fmt$(Number(r.gross_profit))}
                    </td>
                    <td className="num px-4 py-3 text-right text-[13px]">
                      {r.mc_profit_p50 != null ? fmt$(Number(r.mc_profit_p50)) : "—"}
                      <div className="text-[11px] text-muted-foreground">
                        {r.mc_profit_p5 != null ? `worst ${fmt$(Number(r.mc_profit_p5))}` : ""}
                      </div>
                    </td>
                    <td
                      className="num px-4 py-3 text-right"
                      style={{
                        color:
                          pLoss > 0.35
                            ? "var(--skeptic)"
                            : pLoss > 0.15
                              ? "var(--opportunity)"
                              : "var(--profit-strong)",
                      }}
                    >
                      {r.mc_p_loss != null ? `${Math.round(pLoss * 100)}%` : "—"}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {Math.round(Number(r.acquisition_probability) * 100)}%
                    </td>
                    <td className="num px-4 py-3 text-right">{r.exit_days}d</td>
                    <td className="px-4 py-3 text-[12px] text-skeptic">
                      {flags.length ? `${flags.length} warning${flags.length > 1 ? "s" : ""}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <DossierPanel parcelId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function HelpStrip() {
  const items = [
    { k: "Score", v: "0–100 buy rating. 80+ = great, 65–79 = strong, 50–64 = worth a look." },
    { k: "Our offer", v: "The price we'd pay today to hit our profit target." },
    { k: "Loss risk", v: "How often this deal loses money across thousands of simulations." },
    { k: "Deal odds", v: "How likely the seller says yes at our offer." },
  ];
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface/60 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        How to read this
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.k} className="text-[13px]">
            <span className="font-medium text-foreground">{it.k}: </span>
            <span className="text-muted-foreground">{it.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{sub}</p>
    </div>
  );
}

const SCENARIOS: Record<string, StressScenario> = {
  base: {
    ARV_shock: 0,
    rehab_multiplier: 1,
    hold_months_additive: 0,
    hold_multiplier: 1,
    rate_shock: 0,
    PD_multiplier: 1,
    LGD_multiplier: 1,
    financing_available: true,
    warehouse_haircut: 0,
    insurance_cost_shock: 0,
    liquidity_exit_shock: 0,
  },
  arv15: {
    ARV_shock: -0.15,
    rehab_multiplier: 1,
    hold_months_additive: 0,
    hold_multiplier: 1,
    rate_shock: 0,
    PD_multiplier: 1.4,
    LGD_multiplier: 1.2,
    financing_available: true,
    warehouse_haircut: 0,
    insurance_cost_shock: 0,
    liquidity_exit_shock: 0.05,
  },
  rate200: {
    ARV_shock: 0,
    rehab_multiplier: 1,
    hold_months_additive: 0,
    hold_multiplier: 1,
    rate_shock: 0.2,
    PD_multiplier: 1.2,
    LGD_multiplier: 1.0,
    financing_available: true,
    warehouse_haircut: 0,
    insurance_cost_shock: 0,
    liquidity_exit_shock: 0,
  },
  hold3: {
    ARV_shock: 0,
    rehab_multiplier: 1,
    hold_months_additive: 3,
    hold_multiplier: 1,
    rate_shock: 0,
    PD_multiplier: 1.15,
    LGD_multiplier: 1.0,
    financing_available: true,
    warehouse_haircut: 0,
    insurance_cost_shock: 0.05,
    liquidity_exit_shock: 0,
  },
};

function StressPanel({ rows }: { rows: any[] }) {
  const [key, setKey] = useState<keyof typeof SCENARIOS>("arv15");
  const scenario = SCENARIOS[key];

  const { deals, weights, perDeal } = useMemo(() => {
    const deals: DealBase[] = [];
    const weights: number[] = [];
    const perDeal: Array<{
      id: string;
      addr: string;
      base: number;
      stressed: number;
      delta: number;
    }> = [];
    for (const r of rows) {
      const arv = pickArv(r);
      const P = Number(r.modeled_offer ?? 0);
      const R = Number(r.reno_cost ?? 0);
      const exit_days = Number(r.exit_days ?? 90);
      if (!Number.isFinite(arv) || !arv) continue;
      const d: DealBase = {
        ARV: arv,
        P,
        R,
        H_base: Math.max(1, exit_days / 30),
        base_rate: 0.11,
        base_insurance: 180,
        base_selling_cost: Number(r.selling_cost ?? arv * 0.06),
        base_loan_cost_per_month: (P * 0.11) / 12,
        base_carry_cost_per_month: Number(r.carry_cost ?? 3800) / Math.max(1, exit_days / 30),
        EAD: Number(r.ead ?? P + R),
        PD_credit: Number(r.pd_credit ?? 0.05),
        LGD: Number(r.lgd ?? 0.4),
        E_profit_base: Number(r.risk_adjusted_profit_credit ?? r.gross_profit ?? 0),
      };
      deals.push(d);
      weights.push(1);
      const s = stressedDeal(d, scenario);
      perDeal.push({
        id: r.parcel_id,
        addr: r.parcels?.address ?? "—",
        base: d.E_profit_base,
        stressed: s.EProfit,
        delta: s.EProfit - d.E_profit_base,
      });
    }
    return { deals, weights, perDeal };
  }, [rows, scenario]);

  const portfolioLoss = portfolioStressLossMean(deals, weights, scenario);
  const totalBase = perDeal.reduce((a, r) => a + r.base, 0);
  const totalStressed = perDeal.reduce((a, r) => a + r.stressed, 0);

  const buttons: Array<{ k: keyof typeof SCENARIOS; label: string }> = [
    { k: "base", label: "Base" },
    { k: "arv15", label: "-15% ARV" },
    { k: "rate200", label: "Rate +200bps" },
    { k: "hold3", label: "+3 mo hold" },
  ];

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Portfolio stress test
          </div>
          <div className="mt-0.5 text-[13px] text-foreground">
            Applied across {deals.length} deals.
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {buttons.map((b) => (
            <button
              key={b.k}
              onClick={() => setKey(b.k)}
              className="rounded-md border px-2.5 py-1 text-[12px]"
              style={{
                borderColor:
                  key === b.k
                    ? "color-mix(in oklab, var(--opportunity) 45%, transparent)"
                    : "var(--border)",
                background:
                  key === b.k
                    ? "color-mix(in oklab, var(--opportunity) 12%, transparent)"
                    : "var(--surface-2)",
                color: key === b.k ? "var(--opportunity)" : "var(--foreground)",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniBox label="Base E[Profit]" v={fmt$(totalBase)} />
        <MiniBox
          label="Stressed E[Profit]"
          v={fmt$(totalStressed)}
          tone={totalStressed < totalBase ? "skeptic" : "profit"}
        />
        <MiniBox label="Portfolio loss" v={fmt$(portfolioLoss)} tone="skeptic" />
        <MiniBox
          label="Delta / deal (avg)"
          v={fmt$(perDeal.length ? (totalStressed - totalBase) / perDeal.length : 0)}
        />
      </div>
    </div>
  );
}

function MiniBox({ label, v, tone }: { label: string; v: string; tone?: "skeptic" | "profit" }) {
  const color =
    tone === "skeptic" ? "var(--skeptic)" : tone === "profit" ? "var(--profit-strong)" : undefined;
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-[14px] font-semibold" style={{ color }}>
        {v}
      </div>
    </div>
  );
}

function RealieLookup({ onCreated }: { onCreated: (id: string) => void }) {
  const lookup = useServerFn(lookupParcelByAddress);
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [state, setState] = useState("TX");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim() || !state.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await lookup({
        data: {
          address: address.trim(),
          state: state.trim().toUpperCase(),
          city: city.trim() || undefined,
        },
      });
      await qc.invalidateQueries({ queryKey: ["ranked-all"] });
      onCreated(r.parcel_id);
      setAddress("");
    } catch (e: any) {
      setErr(e?.message ?? "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex-1 min-w-[220px]">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Add parcel by address (Realie)
        </div>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St"
          className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-foreground"
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">State</div>
        <input
          value={state}
          onChange={(e) => setState(e.target.value)}
          maxLength={2}
          className="mt-1 w-16 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13px] uppercase outline-none focus:border-foreground"
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          City (optional)
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Austin"
          className="mt-1 w-40 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-foreground"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12px] hover:bg-surface disabled:opacity-50"
      >
        {busy ? "Underwriting…" : "Lookup + underwrite"}
      </button>
      {err && <div className="w-full text-[12px] text-skeptic">{err}</div>}
    </form>
  );
}
