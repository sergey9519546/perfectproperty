import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listRankedParcels } from "@/lib/parcels.functions";
import { DossierPanel } from "@/components/DossierPanel";
import { PageHeader } from "@/components/PageHeader";
import { fmt$ } from "@/lib/format";
import { Sparkle } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { SectionBoundary } from "@/components/SectionBoundary";
import { ScorePill } from "@/components/ScorePill";

export const Route = createFileRoute("/shadow")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/shadow" } });
  },
  head: () => ({
    meta: [
      { title: "Shadow Market — Perfect Property Engine" },
      { name: "description", content: "Off-market parcels ranked by acquisition gravity. No competition, because no listing." },
    ],
  }),
  component: () => (
    <SectionBoundary label="Shadow market unavailable" minHeight={400}>
      <ShadowPage />
    </SectionBoundary>
  ),
});

function ShadowPage() {
  const fn = useServerFn(listRankedParcels);
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["shadow"], queryFn: () => fn({ data: { ring: 2, limit: 500 } }) });
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <PageHead
          title="Shadow Market"
          sub="Off-market parcels no portal shows: distress signals stacked and ranked, before anyone competes for them."
          icon={
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: "color-mix(in oklab, var(--shadow-ring) 18%, transparent)" }}
            >
              <Sparkle className="h-5 w-5 text-shadow-ring" />
            </div>
          }
        />

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {q.isLoading && Array.from({length:6}).map((_,i)=>(<div key={i} className="rounded-lg border border-border bg-surface p-4"><div className="skeleton h-5 w-3/4 rounded-sm" /><div className="skeleton mt-3 h-4 w-1/2 rounded-sm" /><div className="skeleton mt-2 h-4 w-2/3 rounded-sm" /></div>))}
          {(q.data ?? []).map((r: any, i: number) => {
            const flags = (r.skeptic_flags as string[]) ?? [];
            return (
              <button key={r.parcel_id} onClick={() => setSel(r.parcel_id)} style={{animationDelay:`${Math.min(i*50,500)}ms`}} className="text-left rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{r.parcels.address}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.parcels.city}, {r.parcels.state}</div>
                  </div>
                  <ScorePill score={Number(r.perfect_score)} size="lg" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <Metric label="Offer" v={fmt$(Number(r.modeled_offer))} />
                  <Metric label="Profit" v={fmt$(Number(r.gross_profit))} accent />
                  <Metric label="P(acq)" v={`${Math.round(Number(r.acquisition_probability) * 100)}%`} />
                  <Metric label="Exit" v={`${r.exit_days}d`} />
                </div>
                {flags.length > 0 && <div className="mt-2 text-[10px] text-skeptic">{flags.length} skeptic flag{flags.length > 1 ? "s" : ""}</div>}
              </button>
            );
          })}
        </div>
      </div>
      <DossierPanel parcelId={sel} onClose={() => setSel(null)} />
    </>
  );
}
function Metric({ label, v, accent }: { label: string; v: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={"num text-[12px] " + (accent ? "text-profit-strong" : "")}>{v}</div>
    </div>
  );
}
