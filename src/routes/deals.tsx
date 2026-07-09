import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listRankedParcels } from "@/lib/parcels.functions";
import { DossierPanel } from "@/components/DossierPanel";
import { fmt$, tierLabel, ringLabel } from "@/lib/format";
import { stressedDeal, portfolioStressLossMean, type StressScenario, type DealBase } from "@/lib/engine/credit";

export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title: "Ranked Deals — Perfect Property Engine" },
      { name: "description", content: "Every underwritten parcel, ranked by risk-adjusted Perfect Score." },
    ],
  }),
  component: DealsPage,
});

function DealsPage() {
  const listFn = useServerFn(listRankedParcels);
  const [selected, setSelected] = useState<string | null>(null);
  const [includeFixture, setIncludeFixture] = useState(false);
  const q = useQuery({
    queryKey: ["ranked-all", includeFixture],
    queryFn: () => listFn({ data: { limit: 500, include_fixture: includeFixture } }),
  });
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <PageHead title="Ranked deals" sub="Every parcel the machine has underwritten, sorted by Perfect Score. Click any row for the full Dossier." />
        <div className="mt-4 flex items-center gap-3 text-[12px]">
          <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
            <input type="checkbox" checked={includeFixture} onChange={(e) => setIncludeFixture(e.target.checked)} />
            Include demo (FIXTURE) data
          </label>
          <span className="text-muted-foreground">Showing {q.data?.length ?? 0} {includeFixture ? "parcels (live + demo)" : "LIVE parcels"}.</span>
        </div>
        <StressPanel rows={q.data ?? []} />
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Address</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-left">Ring</th>
                <th className="px-4 py-3 text-left">Scope</th>
                <th className="px-4 py-3 text-right">Offer</th>
                <th className="px-4 py-3 text-right">Gross Profit</th>
                <th className="px-4 py-3 text-right">P50 · P5</th>
                <th className="px-4 py-3 text-right">P(loss)</th>
                <th className="px-4 py-3 text-right">P(acq)</th>
                <th className="px-4 py-3 text-right">Exit</th>
                <th className="px-4 py-3 text-left">Skeptic</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((r: any) => {
                const t = tierLabel(Number(r.perfect_score));
                const flags = (r.skeptic_flags as string[]) ?? [];
                return (
                  <tr key={r.parcel_id} onClick={() => setSelected(r.parcel_id)} className="cursor-pointer border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.parcels.address}</div>
                      <div className="text-[11px] text-muted-foreground">{r.parcels.city}, {r.parcels.state}</div>
                    </td>
                    <td className="num px-4 py-3 text-right font-semibold" style={{ color: t.color }}>{r.perfect_score}</td>
                    <td className="px-4 py-3 text-[12px]">{ringLabel(r.ring)}</td>
                    <td className="px-4 py-3 text-[12px]">{r.recommended_scope}</td>
                    <td className="num px-4 py-3 text-right">{fmt$(Number(r.modeled_offer))}</td>
                    <td className="num px-4 py-3 text-right text-profit-strong">{fmt$(Number(r.gross_profit))}</td>
                    <td className="num px-4 py-3 text-right text-[12px]">
                      {r.mc_profit_p50 != null ? fmt$(Number(r.mc_profit_p50)) : "—"}
                      <div className="text-[10px] text-muted-foreground">{r.mc_profit_p5 != null ? `p5 ${fmt$(Number(r.mc_profit_p5))}` : ""}</div>
                    </td>
                    <td className="num px-4 py-3 text-right" style={{ color: Number(r.mc_p_loss) > 0.35 ? "var(--skeptic)" : Number(r.mc_p_loss) > 0.15 ? "var(--opportunity)" : "var(--profit-strong)" }}>
                      {r.mc_p_loss != null ? `${Math.round(Number(r.mc_p_loss) * 100)}%` : "—"}
                    </td>
                    <td className="num px-4 py-3 text-right">{Math.round(Number(r.acquisition_probability) * 100)}%</td>
                    <td className="num px-4 py-3 text-right">{r.exit_days}d</td>
                    <td className="px-4 py-3 text-[11px] text-skeptic">{flags.length ? `${flags.length} flag${flags.length > 1 ? "s" : ""}` : "—"}</td>
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

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}
