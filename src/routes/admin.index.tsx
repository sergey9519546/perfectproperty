import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCoverage } from "@/lib/parcels.functions";
import { runUnderwrite } from "@/lib/seed.functions";
import { ingestCounty, scoreAll, listSources } from "@/lib/ingest.functions";
import { ingestAllNycSales, salesSummary } from "@/lib/sales.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Lightning, Globe, Scroll, Copy } from "@phosphor-icons/react";
import { ProbePanel } from "@/components/admin/ProbePanel";
import { RecipeManager } from "@/components/admin/RecipeManager";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({ to: "/auth", search: { next: "/admin" } });
    }
    const { data: isAdmin, error } = await (supabase as any).rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (error || !isAdmin) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "Ingestion — Perfect Property Engine" },
      { name: "description", content: "Data adapters, coverage, and the nightly underwrite pipeline." },
    ],
  }),
  component: AdminPage,
});

const ADAPTERS = [
  { name: "Parcels + Assessor", status: "LIVE — county ArcGIS/Socrata", real: "LA · SD · SF · Miami-Dade · Broward · NYC" },
  { name: "FEMA Flood Zones", status: "LIVE — hazards.fema.gov NFHL", real: "Sampled during parcel enrichment" },
  { name: "NYC Sales", status: "LIVE — Socrata (5 boroughs)", real: "4,900+ real closed sales ingested" },
  { name: "Recorder / Deeds", status: "Awaiting Scrapy spider", real: "County recorder scrape (per-county HTML) to /api/public/scrapy-ingest" },
  { name: "Distress Signals", status: "Awaiting Scrapy spider", real: "LA Treasurer tax-defaulted, foreclosure dockets, probate, code violations" },
  { name: "HUD Homes", status: "URL wired", real: "hudhomestore.gov storefront" },
  { name: "MLS Feed", status: "Requires broker license", real: "RESO / Trestle" },
  { name: "Aggregator", status: "Optional", real: "ATTOM / PropStream / Estated" },
];

function AdminPage() {
  const covFn = useServerFn(getCoverage);
  const uwFn = useServerFn(runUnderwrite);
  const ingestFn = useServerFn(ingestCounty);
  const scoreFn = useServerFn(scoreAll);
  const sourcesFn = useServerFn(listSources);
  const salesFn = useServerFn(ingestAllNycSales);
  const salesSumFn = useServerFn(salesSummary);
  const qc = useQueryClient();
  const cov = useQuery({ queryKey: ["coverage"], queryFn: () => covFn() });
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => sourcesFn() });
  const sales = useQuery({ queryKey: ["sales-summary"], queryFn: () => salesSumFn() });

  // Coordinate ProbePanel -> RecipeManager schema discovery handoff
  const [discoverUrl, setDiscoverUrl] = useState<string | null>(null);

  const uw = useMutation({
    mutationFn: () => uwFn(),
    onSuccess: (r: any) => {
      toast.success(`Underwrote ${r.scored} live parcels${r.skipped ? ` · skipped ${r.skipped}` : ""}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message ?? "Underwrite failed"),
  });

  const ingest = useMutation({
    mutationFn: (fips: string) => ingestFn({ data: { county_fips: fips, max_parcels: 300, enrich_flood: true } }),
    onSuccess: (r: any) => {
      if (r.status === "OK") toast.success(`${r.name}: ingested ${r.inserted} real parcels`);
      else toast.error(`${r.name}: ${r.note}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message ?? "Ingest failed"),
  });

  const ingestAll = useMutation({
    mutationFn: async () => {
      const list = (sources.data ?? []).filter((s: any) => s.parcels);
      const results: any[] = [];
      for (const s of list) {
        try {
          results.push(await ingestFn({ data: { county_fips: s.fips, max_parcels: 250, enrich_flood: true } }));
        } catch (e: any) {
          results.push({ name: s.name, status: "FAIL", note: e.message });
        }
      }
      return results;
    },
    onSuccess: (rs: any[]) => {
      const ok = rs.filter((r) => r.status === "OK").length;
      toast.success(`Scanned ${rs.length} counties · ${ok} live`);
      qc.invalidateQueries();
    },
  });

  const score = useMutation({
    mutationFn: () => scoreFn(),
    onSuccess: (r: any) => {
      toast.success(`Scored ${r.scored} real parcels · ${r.comps_backed ?? 0} backed by real comps`);
      qc.invalidateQueries();
    },
  });

  const salesMut = useMutation({
    mutationFn: () => salesFn(),
    onSuccess: (rs: any[]) => {
      const total = rs.reduce((a, r) => a + (r.inserted ?? 0), 0);
      const matched = rs.reduce((a, r) => a + (r.matched_to_parcels ?? 0), 0);
      toast.success(`NYC sales: ${total.toLocaleString()} rows · ${matched.toLocaleString()} linked to parcels`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message ?? "Sales ingest failed"),
  });

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/public/scrapy-ingest` : "";

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <PageHead
        title="Ingestion"
        sub="Every data adapter, every coverage number, every underwrite run. This is the operator's control panel for the pipeline."
      />

      {/* ---- Action buttons ---- */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => ingestAll.mutate()} disabled={ingestAll.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          <Globe className="h-4 w-4" />
          {ingestAll.isPending ? "Scanning live sources…" : "Scan all live public sources"}
        </button>
        <button onClick={() => salesMut.mutate()} disabled={salesMut.isPending} className="inline-flex items-center gap-2 rounded-md bg-opportunity px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50">
          <Scroll className="h-4 w-4" />
          {salesMut.isPending ? "Fetching NYC sales…" : "Ingest real NYC sales (5 boroughs)"}
        </button>
        <button onClick={() => score.mutate()} disabled={score.isPending} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          <Lightning className="h-4 w-4" />
          {score.isPending ? "Scoring…" : "Underwrite real parcels (uses comps)"}
        </button>
        <button onClick={() => uw.mutate()} disabled={uw.isPending} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          <Lightning className="h-4 w-4" />
          {uw.isPending ? "Scoring…" : "Rescore every parcel"}
        </button>
      </div>

      {/* ---- Live sources grid ---- */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Live public data sources</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {(sources.data ?? []).map((s: any) => (
            <div key={s.fips} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{s.state} · {s.name}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{s.parcels?.kind ?? "—"}</div>
                </div>
                <button onClick={() => ingest.mutate(s.fips)} disabled={ingest.isPending} className="rounded-md bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                  Fetch live
                </button>
              </div>
              <div className="mt-2 truncate text-[10px] text-muted-foreground" title={s.parcels?.url}>{s.parcels?.url ?? "no parcel endpoint"}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- URL probe + schema discovery (extracted) ---- */}
      <ProbePanel onDiscoverUrl={(url) => setDiscoverUrl(url)} />

      {/* ---- Recipe management (extracted) ---- */}
      <RecipeManager discoverUrl={discoverUrl} onDiscoverConsumed={() => setDiscoverUrl(null)} />

      {/* ---- Scrapy webhook ---- */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Scrapy Cloud ingest webhook</h2>
        <div className="mt-2 rounded-lg border border-border bg-surface p-3">
          <div className="text-[12px] text-muted-foreground">
            External Scrapy spiders (e.g. generated by Zyte's <code>/scrape</code> plugin) POST items here.
            Signed with HMAC-SHA256(<code>SCRAPY_INGEST_SECRET</code>, raw body) in the <code>x-signature</code> header.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-border bg-background px-2 py-1 text-[11px]">{webhookUrl}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Webhook URL copied"); }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] hover:bg-surface"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Full drop-in Scrapy pipeline in <code>docs/scrapy.md</code>. Recipes accepted:
            <span className="ml-1 font-mono text-foreground">foreclosure · probate · code_violation · sale · auction · parcel</span>
          </div>
        </div>
      </section>

      {/* ---- Honesty banner ---- */}
      <section className="mt-8">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-skeptic/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-skeptic">Honesty banner</span>
            <span className="text-[12px] text-muted-foreground">what the app actually knows right now</span>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Real (LIVE) parcels</div>
              <div className="num mt-1 text-2xl font-semibold text-profit-strong">{(cov.data?.live_totals?.parcels ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Scored: {(cov.data?.live_totals?.scored ?? 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Real comps ingested</div>
              <div className="num mt-1 text-2xl font-semibold text-opportunity">{(sales.data?.total ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Linked to parcels: {(sales.data?.linked_to_parcels ?? 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Scored parcels</div>
              <div className="num mt-1 text-2xl font-semibold text-primary">{(cov.data?.live_totals?.scored ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Underwritten by the engine.</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Graded predictions</div>
              <div className="num mt-1 text-2xl font-semibold">{(cov.data?.accuracy?.total ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Real closed-sale outcomes only.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- County coverage + adapters ---- */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">County coverage</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">County</th>
                  <th className="px-4 py-2 text-right">Parcels</th>
                  <th className="px-4 py-2 text-left">Last ingest</th>
                </tr>
              </thead>
              <tbody>
                {(cov.data?.counties ?? []).map((c: any) => (
                  <tr key={c.fips} className="border-t border-border">
                    <td className="px-4 py-2">{c.state} · {c.name}</td>
                    <td className="num px-4 py-2 text-right text-profit-strong">{(c.live_parcels ?? 0).toLocaleString()}</td>
                    <td className="num px-4 py-2 text-muted-foreground text-[11px]">{c.last_ingested_at ? new Date(c.last_ingested_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {(cov.data?.counties?.length ?? 0) === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-sm">No counties yet — click Scan live sources.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Data adapters</h2>
          <div className="mt-2 space-y-2">
            {ADAPTERS.map((a) => (
              <div key={a.name} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium">{a.name}</div>
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{a.status}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Real feed: {a.real}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Recent runs ---- */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Recent runs</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Started</th>
                <th className="px-4 py-2 text-left">County</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Rows</th>
                <th className="px-4 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(cov.data?.runs ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="num px-4 py-2 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="num px-4 py-2">{r.county_fips}</td>
                  <td className="px-4 py-2">{r.source}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{
                      color: r.status === "OK" ? "var(--profit-strong)" : r.status === "PARTIAL" ? "var(--opportunity)" : "var(--skeptic)",
                      backgroundColor: "color-mix(in oklab, " + (r.status === "OK" ? "var(--profit-strong)" : r.status === "PARTIAL" ? "var(--opportunity)" : "var(--skeptic)") + " 15%, transparent)",
                    }}>{r.status}</span>
                  </td>
                  <td className="num px-4 py-2 text-right">{r.rows_ingested}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}