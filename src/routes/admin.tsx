import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCoverage } from "@/lib/parcels.functions";
import { seedFixtures, runUnderwrite } from "@/lib/seed.functions";
import { ingestCounty, scoreAll, listSources } from "@/lib/ingest.functions";
import { ingestAllNycSales, salesSummary } from "@/lib/sales.functions";
import { probeUrl, listProbes } from "@/lib/probe.functions";
import { discoverSchema, saveRecipe, listRecipes, runRecipe, deleteRecipe } from "@/lib/recipes.functions";
import { PageHead } from "./deals";
import { toast } from "sonner";
import { Database, Zap, Globe, ScrollText, Search, Wand2, Play, Trash2, Copy } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Ingestion — Perfect Property Engine" },
      { name: "description", content: "Data adapters, coverage, and the nightly underwrite pipeline." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const covFn = useServerFn(getCoverage);
  const seedFn = useServerFn(seedFixtures);
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
  const probeFn = useServerFn(probeUrl);
  const probesFn = useServerFn(listProbes);
  const probes = useQuery({ queryKey: ["probes"], queryFn: () => probesFn() });
  const [probeInput, setProbeInput] = useState("");
  const [probeTier, setProbeTier] = useState<"auto" | "plain" | "zyte" | "browser">("auto");
  const [probeResult, setProbeResult] = useState<any>(null);
  const probe = useMutation({
    mutationFn: (v: { url: string; tier: any }) => probeFn({ data: { url: v.url, tier: v.tier, force: false, ttl_hours: 24 } }),
    onSuccess: (r) => { setProbeResult(r); toast.success(`Probe ${r.status} · ${r.tier} · ${(r.bytes/1024).toFixed(1)}KB`); qc.invalidateQueries({ queryKey: ["probes"] }); },
    onError: (e: any) => toast.error(e.message ?? "Probe failed"),
  });



  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r) => { toast.success(`Ingested ${r.parcels} parcels · ${r.deeds} deeds · ${r.distress} distress · ${r.listings} listings`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Seed failed"),
  });
  const uw = useMutation({
    mutationFn: () => uwFn(),
    onSuccess: (r) => { toast.success(`Underwrote ${r.scored} parcels · ${r.outcomes} historical outcomes graded`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Underwrite failed"),
  });
  const ingest = useMutation({
    mutationFn: (fips: string) => ingestFn({ data: { county_fips: fips, max_parcels: 300, enrich_flood: true } }),
    onSuccess: (r) => {
      if (r.status === "OK") toast.success(`${r.name}: ingested ${r.inserted} real parcels`);
      else toast.error(`${r.name}: ${r.note}`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Ingest failed"),
  });
  const ingestAll = useMutation({
    mutationFn: async () => {
      const list = (sources.data ?? []).filter((s: any) => s.parcels);
      const results = [] as any[];
      for (const s of list) {
        try { results.push(await ingestFn({ data: { county_fips: s.fips, max_parcels: 250, enrich_flood: true } })); }
        catch (e: any) { results.push({ name: s.name, status: "FAIL", note: e.message }); }
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
    onSuccess: (r: any) => { toast.success(`Scored ${r.scored} real parcels · ${r.comps_backed ?? 0} backed by real comps`); qc.invalidateQueries(); },
  });
  const salesMut = useMutation({
    mutationFn: () => salesFn(),
    onSuccess: (rs: any[]) => {
      const total = rs.reduce((a, r) => a + (r.inserted ?? 0), 0);
      const matched = rs.reduce((a, r) => a + (r.matched_to_parcels ?? 0), 0);
      toast.success(`NYC sales: ${total.toLocaleString()} rows · ${matched.toLocaleString()} linked to parcels`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Sales ingest failed"),
  });


  const adapters = [
    { name: "Parcels + Assessor", source: "PARCELS", status: "LIVE — county ArcGIS/Socrata", real: "LA · SD · SF · Miami-Dade · Broward" },
    { name: "FEMA Flood Zones", source: "FEMA", status: "LIVE — hazards.fema.gov NFHL", real: "Sampled during parcel enrichment" },
    { name: "Recorder / Deeds", source: "DEEDS", status: "Fixture", real: "County recorder scrape (per-county HTML)" },
    { name: "Distress Signals", source: "DISTRESS", status: "Fixture", real: "LA Treasurer tax-defaulted list, foreclosure dockets, probate court, code violations" },
    { name: "HUD Homes", source: "HUD", status: "URL wired", real: "hudhomestore.gov storefront" },
    { name: "MLS Feed", source: "MLS", status: "Fixture", real: "RESO / Trestle — requires licensed broker" },
    { name: "Aggregator", source: "AGGREGATOR", status: "—", real: "ATTOM / PropStream / Estated" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <PageHead title="Ingestion" sub="Every data adapter, every coverage number, every underwrite run. This is the operator's control panel for the pipeline described in Layer 1." />

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => ingestAll.mutate()} disabled={ingestAll.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Globe className="h-4 w-4" />
          {ingestAll.isPending ? "Scanning live sources…" : "Scan all live public sources"}
        </button>
        <button onClick={() => salesMut.mutate()} disabled={salesMut.isPending} className="inline-flex items-center gap-2 rounded-md bg-opportunity px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          <ScrollText className="h-4 w-4" />
          {salesMut.isPending ? "Fetching NYC sales…" : "Ingest real NYC sales (5 boroughs)"}
        </button>
        <button onClick={() => score.mutate()} disabled={score.isPending} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          <Zap className="h-4 w-4" />
          {score.isPending ? "Scoring…" : "Underwrite real parcels (uses comps)"}
        </button>
        <button onClick={() => seed.mutate()} disabled={seed.isPending} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          <Database className="h-4 w-4" />
          {seed.isPending ? "Ingesting…" : "Load fixtures (demo)"}
        </button>
        <button onClick={() => uw.mutate()} disabled={uw.isPending} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          <Zap className="h-4 w-4" />
          {uw.isPending ? "Scoring…" : "Fixture underwrite"}
        </button>
      </div>

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
                <button onClick={() => ingest.mutate(s.fips)} disabled={ingest.isPending} className="rounded-md bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">
                  Fetch live
                </button>
              </div>
              <div className="mt-2 truncate text-[10px] text-muted-foreground" title={s.parcels?.url}>{s.parcels?.url ?? "no parcel endpoint"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Live URL probe · tiered fetcher</h2>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Zyte key: <span className={probes.data?.zyte_key_present ? "text-profit-strong" : "text-skeptic"}>{probes.data?.zyte_key_present ? "present" : "missing"}</span>
            {" · "}Cached URLs: <span className="text-foreground">{probes.data?.cached ?? 0}</span>
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={probeInput}
              onChange={(e) => setProbeInput(e.target.value)}
              placeholder="https://recorder.county.gov/foreclosure-calendar"
              className="flex-1 min-w-[280px] rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
            />
            <select
              value={probeTier}
              onChange={(e) => setProbeTier(e.target.value as any)}
              className="rounded-md border border-border bg-background px-2 py-2 text-[12px]"
            >
              <option value="auto">auto (plain → zyte → browser)</option>
              <option value="plain">plain fetch (free)</option>
              <option value="zyte">zyte http (rotating proxy)</option>
              <option value="browser">zyte browser (JS render)</option>
            </select>
            <button
              onClick={() => probeInput && probe.mutate({ url: probeInput, tier: probeTier })}
              disabled={!probeInput || probe.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {probe.isPending ? "Fetching…" : "Probe URL"}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Plain = free direct fetch (~40% of county HTML). Zyte = anti-bot proxy (~$0.0002/req, needs <code>ZYTE_API_KEY</code>). Browser = JS render (~5× cost). Results cached 24h.
          </div>

          {probeResult && (
            <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-[12px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest" style={{
                  color: probeResult.status === "OK" || probeResult.status === "CACHED" ? "var(--profit-strong)" : probeResult.status === "BLOCKED" ? "var(--opportunity)" : "var(--skeptic)",
                  backgroundColor: "color-mix(in oklab, " + (probeResult.status === "OK" || probeResult.status === "CACHED" ? "var(--profit-strong)" : probeResult.status === "BLOCKED" ? "var(--opportunity)" : "var(--skeptic)") + " 15%, transparent)",
                }}>{probeResult.status}</span>
                <span className="text-muted-foreground">tier: <span className="text-foreground">{probeResult.tier}</span></span>
                <span className="text-muted-foreground">HTTP: <span className="text-foreground">{probeResult.http_status}</span></span>
                <span className="text-muted-foreground">{(probeResult.bytes / 1024).toFixed(1)} KB</span>
                <span className="text-muted-foreground">{probeResult.duration_ms} ms</span>
              </div>
              {probeResult.title && <div className="mt-2 font-medium">{probeResult.title}</div>}
              <div className="mt-1 truncate text-[11px] text-muted-foreground">{probeResult.final_url}</div>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Headings</div>
                  <ul className="mt-1 space-y-0.5">
                    {(probeResult.hints?.headings ?? []).slice(0, 8).map((h: string, i: number) => (
                      <li key={i} className="truncate text-[11px]">• {h}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Dates / $</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(probeResult.hints?.dates ?? []).map((d: string, i: number) => (
                      <span key={"d" + i} className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono">{d}</span>
                    ))}
                    {(probeResult.hints?.dollars ?? []).map((d: string, i: number) => (
                      <span key={"$" + i} className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono text-profit">{d}</span>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">Structure</div>
                  <div className="text-[11px] text-muted-foreground">Tables: {probeResult.hints?.tables ?? 0} · Forms: {probeResult.hints?.forms ?? 0}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Links (first 8)</div>
                  <ul className="mt-1 space-y-0.5">
                    {(probeResult.hints?.links ?? []).slice(0, 8).map((l: any, i: number) => (
                      <li key={i} className="truncate text-[11px]">
                        <a href={l.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{l.text}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">Text preview (first 4KB)</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px]">{probeResult.text_preview}</pre>
              </details>
            </div>
          )}

          {(probes.data?.runs?.length ?? 0) > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent probes</div>
              <div className="mt-1 max-h-48 overflow-y-auto">
                {(probes.data?.runs ?? []).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 border-t border-border py-1 text-[11px]">
                    <span className="w-16 text-muted-foreground">{r.tier}</span>
                    <span className="w-16" style={{ color: r.status === "OK" || r.status === "CACHED" ? "var(--profit-strong)" : r.status === "BLOCKED" ? "var(--opportunity)" : "var(--skeptic)" }}>{r.status}</span>
                    <span className="w-14 num text-muted-foreground">{r.http_status ?? "—"}</span>
                    <span className="w-16 num text-muted-foreground">{r.duration_ms ?? 0}ms</span>
                    <span className="flex-1 truncate">{r.url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>



      <section className="mt-8">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-skeptic/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-skeptic">Honesty banner</span>
            <span className="text-[12px] text-muted-foreground">what the app actually knows right now</span>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Real (LIVE) parcels</div>
              <div className="mt-1 text-2xl font-semibold text-profit-strong">
                {(cov.data?.live_totals?.parcels ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">Scored: {(cov.data?.live_totals?.scored ?? 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Real comps ingested</div>
              <div className="mt-1 text-2xl font-semibold text-opportunity">
                {(sales.data?.total ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">Linked to parcels: {(sales.data?.linked_to_parcels ?? 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Demo (FIXTURE) parcels</div>
              <div className="mt-1 text-2xl font-semibold text-muted-foreground">
                {(cov.data?.total_fixture_parcels ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">Hidden from /deals by default</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Graded predictions</div>
              <div className="mt-1 text-2xl font-semibold">{(cov.data?.accuracy?.total ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Real closed-sale outcomes only.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">County coverage</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">County</th>
                  <th className="px-4 py-2 text-right">Live</th>
                  <th className="px-4 py-2 text-right">Fixture</th>
                  <th className="px-4 py-2 text-left">Last ingest</th>
                </tr>
              </thead>
              <tbody>
                {(cov.data?.counties ?? []).map((c: any) => (
                  <tr key={c.fips} className="border-t border-border">
                    <td className="px-4 py-2">{c.state} · {c.name}</td>
                    <td className="num px-4 py-2 text-right text-profit-strong">{(c.live_parcels ?? 0).toLocaleString()}</td>
                    <td className="num px-4 py-2 text-right text-muted-foreground">{(c.fixture_parcels ?? 0).toLocaleString()}</td>
                    <td className="num px-4 py-2 text-muted-foreground text-[11px]">{c.last_ingested_at ? new Date(c.last_ingested_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {(cov.data?.counties.length ?? 0) === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No counties yet — click Scan live sources.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Data adapters</h2>
          <div className="mt-2 space-y-2">
            {adapters.map((a) => (
              <div key={a.name} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium">{a.name}</div>
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{a.status}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Real feed → {a.real}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

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
