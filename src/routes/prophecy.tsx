import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listProphecyParcels } from "@/lib/parcels.functions";
import { DossierPanel } from "@/components/DossierPanel";
import { PageHead } from "./deals";
import { fmt$, tierLabel } from "@/lib/format";
import { Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionBoundary } from "@/components/SectionBoundary";

export const Route = createFileRoute("/prophecy")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/prophecy" } });
  },
  head: () => ({
    meta: [
      { title: "Prophecy — Perfect Property Engine" },
      { name: "description", content: "Parcels whose signatures predict acquisition 60–90 days out. Alerted before the opportunity exists anywhere else." },
    ],
  }),
  component: () => (
    <SectionBoundary label="Prophecy unavailable" minHeight={400}>
      <ProphecyPage />
    </SectionBoundary>
  ),
});

function ProphecyPage() {
  const fn = useServerFn(listProphecyParcels);
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["prophecy"], queryFn: () => fn({ data: { min_score: 70, limit: 200 } }) });
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: "color-mix(in oklab, var(--prophecy) 18%, transparent)" }}>
            <Flame className="h-5 w-5 text-prophecy" />
          </div>
          <PageHead title="Prophecy Ring" sub="The crown jewel. Signatures the machine has learned appear 60–90 days before a property becomes acquirable. No listing-scraper can copy this — because it isn't built from listings." />
        </div>
        {q.data && q.data.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            No parcels currently match the prophecy signature. The engine widens the net as more distress trajectories accumulate.
          </div>
        )}
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {(q.data ?? []).map((r: any) => {
            const t = tierLabel(Number(r.perfect_score));
            return (
              <button key={r.parcel_id} onClick={() => setSel(r.parcel_id)} className="rounded-lg border border-prophecy/40 bg-surface p-5 text-left transition-colors hover:bg-surface-2" style={{ borderColor: "color-mix(in oklab, var(--prophecy) 30%, var(--border))" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-prophecy">Prophecy · window opening</div>
                    <div className="mt-1 text-[15px] font-medium">{r.parcels.address}</div>
                    <div className="text-[12px] text-muted-foreground">{r.parcels.city}, {r.parcels.state}</div>
                  </div>
                  <div className="num text-3xl font-semibold" style={{ color: t.color }}>{r.perfect_score}</div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Projected offer</div>
                    <div className="num text-[13px]">{fmt$(Number(r.modeled_offer))}</div>
                  </div>
                  <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Projected profit</div>
                    <div className="num text-[13px] text-profit-strong">{fmt$(Number(r.gross_profit))}</div>
                  </div>
                  <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">P(acquirable)</div>
                    <div className="num text-[13px]">{Math.round(Number(r.acquisition_probability) * 100)}%</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <DossierPanel parcelId={sel} onClose={() => setSel(null)} />
    </>
  );
}
