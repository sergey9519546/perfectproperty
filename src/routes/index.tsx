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
import { SectionBoundary } from "@/components/SectionBoundary";
import { DataFreshness } from "@/components/DataFreshness";

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
            <SectionBoundary label="Deal list unavailable">
              {q.data && <DealList rows={q.data} onSelect={setSelected} selectedId={selected} />}
            </SectionBoundary>
          </div>
        </div>

        {/* MAP */}
        <div className="relative">
          <div className="absolute inset-0">
            <SectionBoundary label="Map unavailable">
              <MapView
                parcels={mapParcels}
                onSelect={setSelected}
                selectedId={selected}
                className="h-full w-full"
              />
            </SectionBoundary>
          </div>
          <MapLegend />
          <div className="absolute bottom-3 left-3"><DataFreshness timestamp={cov.data?.last_updated ?? new Date()} prefix="Data" /></div>
        </div>
      </div>

      <DossierPanel parcelId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CoverageStrip({ cov }: { cov: Awaited<ReturnType<typeof getCoverage>> | undefined }) {
  if (!cov) return <div className="border-b border-border px-5 py-4 text-[12px] text-muted-foreground">Loading coverage…</div>;
  return (
    <div className="border-b border-border px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Live coverage</div>
      <div className="num mt-1 text-2xl font-semibold">
        {cov.total_parcels.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-muted-foreground">properties scored</span>
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">Every property in-range gets a fresh score every night.</div>

      <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Buy rating</div>
      <div className="mt-1 grid grid-cols-4 gap-1.5 text-center text-[11px]">
        <TierPill label="Great" n={cov.tiers.exceptional} color="var(--tier-exceptional)" />
        <TierPill label="Strong" n={cov.tiers.strong} color="var(--tier-strong)" />
        <TierPill label="Look" n={cov.tiers.viable} color="var(--tier-viable)" />
        <TierPill label="Skip" n={cov.tiers.watch} color="var(--tier-watch)" />
      </div>

      <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Where it came from</div>
      <div className="mt-1 grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <RingPill label="Listed" n={cov.rings.r1} icon={<Eye className="h-3 w-3" />} />
        <RingPill label="Off-mkt" n={cov.rings.r2} icon={<Sparkles className="h-3 w-3" />} />
        <RingPill label="Predicted" n={cov.rings.r3} icon={<Flame className="h-3 w-3" />} />
      </div>
    </div>
  );
}

function TierPill({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-1 py-1.5">
      <div className="num text-[14px] font-semibold" style={{ color }}>{n}</div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
    </div>
  );
}
function RingPill({ label, n, icon }: { label: string; n: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface-2 px-1 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="num text-[13px]">{n}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
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
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
        <span className="mr-1 text-muted-foreground">Show</span>
        {([[undefined, "All"], [1, "Listed"], [2, "Off-market"], [3, "Predicted"]] as const).map(([v, l]) => (
          <button
            key={String(l)}
            onClick={() => setRing(v as number | undefined)}
            className={"rounded px-2 py-1 " + (ring === v ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground")}
          >{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
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
            title={`${c.name}, ${c.state}`}
          >{c.state}·{c.name.split(" ")[0]}</button>
        ))}
      </div>
    </div>
  );
}

function DealList({ rows, onSelect, selectedId }: { rows: any[]; onSelect: (id: string) => void; selectedId: string | null }) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Best deals right now</span>
        <span className="num text-foreground">{rows.length}</span>
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
                  <div className="truncate text-[14px] font-medium">{p.address}</div>
                  <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {p.city}, {p.state} · {p.living_sqft?.toLocaleString()} sqft · condition {p.condition_grade}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-muted-foreground">{ringLabel(r.ring)}</span>
                    <span className="text-muted-foreground"><span className="num">{Math.round(Number(r.acquisition_probability) * 100)}%</span> deal odds</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground"><span className="num">{r.exit_days}d</span> to sell</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="num text-xl font-semibold leading-none" style={{ color: tier.color }}>{r.perfect_score}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: tier.color }}>{tier.label}</div>
                  <div className="num mt-1 text-[12px] text-profit-strong">+{fmt$(Number(r.gross_profit))}</div>
                  <div className="num text-[11px] text-muted-foreground">offer {fmt$(Number(r.modeled_offer))}</div>
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
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-border bg-surface/95 p-3 text-[12px] shadow-lg backdrop-blur">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Buy rating (0–100)</div>
      <div className="flex items-center gap-3">
        <LegendDot color="var(--tier-exceptional)" label="Great 80+" />
        <LegendDot color="var(--tier-strong)" label="Strong 65+" />
        <LegendDot color="var(--tier-viable)" label="Look 50+" />
        <LegendDot color="var(--tier-watch)" label="Skip <50" />
      </div>
    </div>
  );
}
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
