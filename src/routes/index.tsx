import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listRankedParcels, getCoverage } from "@/lib/parcels.functions";
import { MapView } from "@/components/MapView";
import { DossierPanel } from "@/components/DossierPanel";
import { fmt$, tierLabel, ringLabel } from "@/lib/format";
import { Flame, Sparkles, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/" } });
  },
  component: HomePage,
});

function HomePage() {
  const listFn = useServerFn(listRankedParcels);
  const coverageFn = useServerFn(getCoverage);
  const [ring, setRing] = useState<number | undefined>(undefined);
  const [county, setCounty] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["ranked", ring, county],
    queryFn: () => listFn({ data: { ring, county_fips: county, limit: 500 } }),
  });

  const cov = useQuery({ queryKey: ["coverage"], queryFn: () => coverageFn() });

  const mapParcels = useMemo(() =>
    (q.data ?? []).map((r: any) => ({
      parcel_id: r.parcel_id,
      lat: r.parcels.lat,
      lng: r.parcels.lng,
      perfect_score: Number(r.perfect_score),
      ring: r.ring,
    })), [q.data]);

  return (
    <>
      <div className="grid grid-cols-[380px_1fr] gap-0 h-[calc(100vh-3.5rem)]">
        {/* LEFT COLUMN: filters + top deals */}
        <div className="flex flex-col overflow-hidden border-r border-border bg-surface/60">
          <CoverageStrip cov={cov.data} />
          <FilterBar
            ring={ring} setRing={setRing}
            county={county} setCounty={setCounty}
            counties={cov.data?.counties ?? []}
          />
          <div className="flex-1 overflow-y-auto">
            {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading the ranked map…</div>}
            {q.data && <DealList rows={q.data} onSelect={setSelected} selectedId={selected} />}
          </div>
        </div>

        {/* MAP */}
        <div className="relative">
          <div className="absolute inset-0">
            <MapView
              parcels={mapParcels}
              onSelect={setSelected}
              selectedId={selected}
              className="h-full w-full"
            />
          </div>
          <MapLegend />
        </div>
      </div>

      <DossierPanel parcelId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CoverageStrip({ cov }: { cov: Awaited<ReturnType<typeof getCoverage>> | undefined }) {
  if (!cov) return <div className="border-b border-border px-5 py-4 text-[11px] text-muted-foreground">Loading coverage…</div>;
  return (
    <div className="border-b border-border px-5 py-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live coverage</div>
      <div className="num mt-1 text-2xl font-semibold">{cov.total_parcels.toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> parcels underwritten</span></div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px]">
        <TierPill label="Exceptional" n={cov.tiers.exceptional} color="var(--tier-exceptional)" />
        <TierPill label="Strong" n={cov.tiers.strong} color="var(--tier-strong)" />
        <TierPill label="Viable" n={cov.tiers.viable} color="var(--tier-viable)" />
        <TierPill label="Watch" n={cov.tiers.watch} color="var(--tier-watch)" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <RingPill label="Open" n={cov.rings.r1} icon={<Eye className="h-3 w-3" />} />
        <RingPill label="Shadow" n={cov.rings.r2} icon={<Sparkles className="h-3 w-3" />} />
        <RingPill label="Prophecy" n={cov.rings.r3} icon={<Flame className="h-3 w-3" />} />
      </div>
    </div>
  );
}

function TierPill({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-1 py-1.5">
      <div className="num text-[13px] font-semibold" style={{ color }}>{n}</div>
      <div className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</div>
    </div>
  );
}
function RingPill({ label, n, icon }: { label: string; n: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface-2 px-1 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="num text-[12px]">{n}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function FilterBar({ ring, setRing, county, setCounty, counties }: {
  ring: number | undefined; setRing: (r: number | undefined) => void;
  county: string | undefined; setCounty: (c: string | undefined) => void;
  counties: { fips: string; name: string; state: string }[];
}) {
  return (
    <div className="border-b border-border px-5 py-3 space-y-2">
      <div className="flex items-center gap-1 text-[11px]">
        <span className="mr-1 text-muted-foreground">Ring</span>
        {[[undefined, "All"], [1, "Open"], [2, "Shadow"], [3, "Prophecy"]].map(([v, l]) => (
          <button
            key={String(l)}
            onClick={() => setRing(v as number | undefined)}
            className={"rounded px-2 py-1 " + (ring === v ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground")}
          >{l as string}</button>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[11px]">
        <span className="mr-1 text-muted-foreground">County</span>
        <button
          onClick={() => setCounty(undefined)}
          className={"rounded px-2 py-1 " + (county === undefined ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground")}
        >All</button>
        {counties.map((c) => (
          <button
            key={c.fips}
            onClick={() => setCounty(c.fips)}
            className={"rounded px-2 py-1 " + (county === c.fips ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground")}
            title={c.name}
          >{c.state}·{c.name.split(" ")[0]}</button>
        ))}
      </div>
    </div>
  );
}

function DealList({ rows, onSelect, selectedId }: { rows: any[]; onSelect: (id: string) => void; selectedId: string | null }) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Top deals · nightly underwrite</span>
        <span className="num">{rows.length}</span>
      </div>
      <ul>
        {rows.map((r) => {
          const p = r.parcels;
          const tier = tierLabel(Number(r.perfect_score));
          const isSel = selectedId === r.parcel_id;
          return (
            <li key={r.parcel_id}>
              <button
                onClick={() => onSelect(r.parcel_id)}
                className={"flex w-full items-start justify-between gap-3 border-b border-border/60 px-5 py-3 text-left transition-colors hover:bg-surface-2 " + (isSel ? "bg-surface-2" : "")}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{p.address}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.city}, {p.state} · {p.living_sqft?.toLocaleString()} sqft · {p.condition_grade}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                    <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-muted-foreground">{ringLabel(r.ring)}</span>
                    <span className="text-muted-foreground num">P(acq) {Math.round(Number(r.acquisition_probability) * 100)}%</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground num">exit {r.exit_days}d</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="num text-lg font-semibold" style={{ color: tier.color }}>{r.perfect_score}</div>
                  <div className="num text-[11px] text-profit-strong">{fmt$(Number(r.gross_profit))}</div>
                  <div className="num text-[10px] text-muted-foreground">@ {fmt$(Number(r.modeled_offer))}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-border bg-surface/95 p-3 text-[11px] shadow-lg backdrop-blur">
      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Heat legend</div>
      <div className="flex items-center gap-3">
        <LegendDot color="var(--tier-exceptional)" label="80+" />
        <LegendDot color="var(--tier-strong)" label="65–79" />
        <LegendDot color="var(--tier-viable)" label="50–64" />
        <LegendDot color="var(--tier-watch)" label="<50" />
      </div>
    </div>
  );
}
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="num text-muted-foreground">{label}</span>
    </div>
  );
}
