import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCoverage } from "@/lib/parcels.functions";
import { runUnderwrite } from "@/lib/seed.functions";
import { ingestCounty, scoreAll, listSources } from "@/lib/ingest.functions";
import { ingestAllNycSales, salesSummary } from "@/lib/sales.functions";
import { probeUrl, listProbes } from "@/lib/probe.functions";
import { discoverSchema, saveRecipe, listRecipes, runRecipe, deleteRecipe } from "@/lib/recipes.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "./deals";
import { toast } from "sonner";
import { Zap, Globe, ScrollText, Search, Wand2, Play, Trash2, Copy } from "lucide-react";

export const Route = createFileRoute("/admin")({
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

  // ---- Recipe wizard ----
  const discoverFn = useServerFn(discoverSchema);
  const saveRecipeFn = useServerFn(saveRecipe);
  const listRecipesFn = useServerFn(listRecipes);
  const runRecipeFn = useServerFn(runRecipe);
  const deleteRecipeFn = useServerFn(deleteRecipe);
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: () => listRecipesFn() });
  const [wizard, setWizard] = useState<null | { url: string; candidates: any[]; base_url: string; selectedIdx: number; name: string; target: "distress_events" | "sales" | "parcels" }>(null);
  const discover = useMutation({
    mutationFn: (url: string) => discoverFn({ data: { url } }),
    onSuccess: (r, url) => {
      if (!r.candidates.length) { toast.error("No repeating containers found — try a listing page"); return; }
      setWizard({ url, candidates: r.candidates, base_url: r.base_url, selectedIdx: 0, name: `Recipe ${new Date().toISOString().slice(0,10)}`, target: "distress_events" });
    },
    onError: (e: any) => toast.error(e.message ?? "Discovery failed"),
  });
  const saveRec = useMutation({
    mutationFn: (payload: any) => saveRecipeFn({ data: payload }),
    onSuccess: () => { toast.success("Recipe saved"); setWizard(null); qc.invalidateQueries({ queryKey: ["recipes"] }); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  const [runReport, setRunReport] = useState<{ recipe_id: string; recipe_name: string; result: any } | null>(null);
  const runRec = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      runRecipeFn({ data: { id: v.id, max_rows: 500 } }).then((r) => ({ ...v, result: r })),
    onSuccess: (r: any) => {
      setRunReport({ recipe_id: r.id, recipe_name: r.name, result: r.result });
      toast.success(`${r.name}: ${r.result.note}`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Run failed"),
  });
  const delRec = useMutation({
    mutationFn: (id: string) => deleteRecipeFn({ data: { id } }),
    onSuccess: () => { toast.success("Recipe deleted"); qc.invalidateQueries({ queryKey: ["recipes"] }); },
  });
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/scrapy-ingest` : "";



  const uw = useMutation({
    mutationFn: () => uwFn(),
    onSuccess: (r) => { toast.success(`Underwrote ${r.scored} live parcels${r.skipped ? ` · skipped ${r.skipped}` : ""}`); qc.invalidateQueries(); },
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
    { name: "Parcels + Assessor", source: "PARCELS", status: "LIVE — county ArcGIS/Socrata", real: "LA · SD · SF · Miami-Dade · Broward · NYC" },
    { name: "FEMA Flood Zones", source: "FEMA", status: "LIVE — hazards.fema.gov NFHL", real: "Sampled during parcel enrichment" },
    { name: "NYC Sales", source: "NYC-SALES", status: "LIVE — Socrata (5 boroughs)", real: "4,900+ real closed sales ingested" },
    { name: "Recorder / Deeds", source: "DEEDS", status: "Awaiting Scrapy spider", real: "County recorder scrape (per-county HTML) → /api/public/scrapy-ingest" },
    { name: "Distress Signals", source: "DISTRESS", status: "Awaiting Scrapy spider", real: "LA Treasurer tax-defaulted, foreclosure dockets, probate, code violations" },
    { name: "HUD Homes", source: "HUD", status: "URL wired", real: "hudhomestore.gov storefront" },
    { name: "MLS Feed", source: "MLS", status: "Requires broker license", real: "RESO / Trestle" },
    { name: "Aggregator", source: "AGGREGATOR", status: "Optional", real: "ATTOM / PropStream / Estated" },
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
        <button onClick={() => uw.mutate()} disabled={uw.isPending} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
          <Zap className="h-4 w-4" />
          {uw.isPending ? "Scoring…" : "Rescore every parcel"}
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
                <button
                  onClick={() => discover.mutate(probeInput || probeResult.final_url)}
                  disabled={discover.isPending}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-opportunity px-2 py-1 text-[11px] font-medium text-black disabled:opacity-50"
                >
                  <Wand2 className="h-3 w-3" />
                  {discover.isPending ? "Discovering…" : "Discover schema"}
                </button>
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

      {wizard && (() => {
        const cand = wizard.candidates[wizard.selectedIdx];
        return (
          <section className="mt-8">
            <div className="rounded-lg border border-opportunity/50 bg-surface p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] uppercase tracking-widest text-opportunity">Schema wizard · approve extraction</h2>
                <button onClick={() => setWizard(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Close ✕</button>
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">{wizard.url}</div>

              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Candidate containers ({wizard.candidates.length})</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {wizard.candidates.map((c: any, i: number) => (
                    <button key={i} onClick={() => setWizard({ ...wizard, selectedIdx: i })}
                      className={`rounded-md border px-2 py-1 text-[11px] ${i === wizard.selectedIdx ? "border-opportunity bg-opportunity/10" : "border-border bg-surface-2"}`}>
                      <span className="font-mono">{c.container_selector}</span>
                      <span className="ml-2 text-muted-foreground">×{c.sample_count} · s{c.score}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fields ({cand.fields.length})</div>
                  <div className="mt-1 max-h-72 overflow-y-auto rounded border border-border bg-surface-2 p-2">
                    {cand.fields.map((f: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 border-b border-border/50 py-1 text-[11px] last:border-0">
                        <input
                          value={f.name}
                          onChange={(e) => { const nc = { ...cand }; nc.fields = [...cand.fields]; nc.fields[i] = { ...f, name: e.target.value }; const cs = [...wizard.candidates]; cs[wizard.selectedIdx] = nc; setWizard({ ...wizard, candidates: cs }); }}
                          className="w-28 rounded border border-border bg-background px-1 py-0.5 font-mono"
                        />
                        <select
                          value={f.type}
                          onChange={(e) => { const nc = { ...cand }; nc.fields = [...cand.fields]; nc.fields[i] = { ...f, type: e.target.value }; const cs = [...wizard.candidates]; cs[wizard.selectedIdx] = nc; setWizard({ ...wizard, candidates: cs }); }}
                          className="rounded border border-border bg-background px-1 py-0.5"
                        >
                          <option value="text">text</option><option value="date">date</option><option value="money">money</option><option value="url">url</option><option value="number">number</option>
                        </select>
                        <div className="flex-1 truncate text-muted-foreground" title={f.sample}>{f.sample}</div>
                        <button onClick={() => { const nc = { ...cand }; nc.fields = cand.fields.filter((_: any, j: number) => j !== i); const cs = [...wizard.candidates]; cs[wizard.selectedIdx] = nc; setWizard({ ...wizard, candidates: cs }); }}
                          className="text-skeptic hover:text-skeptic/70">✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample row</div>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface-2 p-2 text-[10px]">{cand.sample_row_text}</pre>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input value={wizard.name} onChange={(e) => setWizard({ ...wizard, name: e.target.value })}
                  className="w-64 rounded-md border border-border bg-background px-2 py-1 text-[12px]" placeholder="Recipe name" />
                <select value={wizard.target} onChange={(e) => setWizard({ ...wizard, target: e.target.value as any })}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[12px]">
                  <option value="distress_events">→ distress_events</option>
                  <option value="sales">→ sales</option>
                  <option value="parcels">→ parcels</option>
                </select>
                <button
                  onClick={() => saveRec.mutate({
                    name: wizard.name, target_table: wizard.target, source_url: wizard.url,
                    container_selector: cand.container_selector, fields: cand.fields,
                  })}
                  disabled={saveRec.isPending}
                  className="rounded-md bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saveRec.isPending ? "Saving…" : "Save recipe"}
                </button>
              </div>
            </div>
          </section>
        );
      })()}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Saved recipes</h2>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{recipes.data?.length ?? 0} total</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Source URL</th>
                <th className="px-3 py-2 text-left">Selector</th>
                <th className="px-3 py-2 text-right">Fields</th>
                <th className="px-3 py-2 text-right">Last run</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {(recipes.data ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.target_table}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={r.source_url}>{r.source_url}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[10px] text-muted-foreground" title={r.container_selector}>{r.container_selector}</td>
                  <td className="num px-3 py-2 text-right">{(r.fields ?? []).length}</td>
                  <td className="num px-3 py-2 text-right text-muted-foreground">
                    {r.last_run_at ? `${r.last_run_rows ?? 0} · ${new Date(r.last_run_at).toLocaleDateString()}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => runRec.mutate({ id: r.id, name: r.name })} disabled={runRec.isPending} className="mr-1 inline-flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-[11px] text-primary-foreground disabled:opacity-50">
                      <Play className="h-3 w-3" /> Run
                    </button>
                    <button onClick={() => confirm(`Delete ${r.name}?`) && delRec.mutate(r.id)} className="rounded border border-border p-1 text-skeptic hover:bg-skeptic/10">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {(recipes.data?.length ?? 0) === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[11px] text-muted-foreground">No recipes yet — probe a URL and click "Discover schema".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {runReport && (() => {
        const res = runReport.result ?? {};
        const mb = res.match_breakdown ?? { apn_county: 0, addr_county: 0, addr_city: 0 };
        const totalMatched = (mb.apn_county ?? 0) + (mb.addr_county ?? 0) + (mb.addr_city ?? 0);
        const denom = totalMatched + (res.unmatched ?? 0);
        const pct = (n: number) => denom > 0 ? Math.round((n / denom) * 100) : 0;
        const reasons: Record<string, number> = res.unmatched_reasons ?? {};
        const samples: any[] = res.unmatched_samples ?? [];
        const reasonLabels: Record<string, string> = {
          no_address_or_apn: "No address or APN in row",
          no_county_or_city_scope: "Missing county FIPS + city (can't scope match)",
          apn_not_found_in_county: "APN not in county parcels",
          address_not_found: "Address didn't normalize to a parcel",
        };
        return (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Last run · {runReport.recipe_name}
              </h2>
              <button onClick={() => setRunReport(null)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Dismiss</button>
            </div>
            <div className="mt-2 rounded-lg border border-border bg-surface p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Extracted" value={res.rows ?? 0} />
                <Stat label="Inserted" value={res.inserted ?? 0} />
                <Stat label="Unmatched" value={res.unmatched ?? 0} tone={res.unmatched > 0 ? "warn" : undefined} />
                <Stat label="Target" value={res.target_table ?? "—"} />
              </div>

              {res.target_table === "distress_events" && (
                <>
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Match confidence</div>
                    <div className="mt-2 overflow-hidden rounded border border-border">
                      <div className="flex h-6 w-full text-[10px]">
                        <ConfBar label={`APN+County ${mb.apn_county}`} pct={pct(mb.apn_county)} className="bg-emerald-500/80 text-white" title="Highest confidence: exact APN match within county" />
                        <ConfBar label={`Addr+County ${mb.addr_county}`} pct={pct(mb.addr_county)} className="bg-primary/80 text-primary-foreground" title="High confidence: normalized address + county" />
                        <ConfBar label={`Addr+City ${mb.addr_city}`} pct={pct(mb.addr_city)} className="bg-amber-500/80 text-white" title="Medium confidence: normalized address + city (no county)" />
                        <ConfBar label={`Unmatched ${res.unmatched}`} pct={pct(res.unmatched)} className="bg-skeptic/70 text-white" title="No parcel resolved" />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span><span className="mr-1 inline-block h-2 w-2 rounded bg-emerald-500/80" />APN+County (highest)</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded bg-primary/80" />Addr+County (high)</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded bg-amber-500/80" />Addr+City (medium)</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded bg-skeptic/70" />Unmatched</span>
                    </div>
                  </div>

                  {Object.keys(reasons).length > 0 && (
                    <div className="mt-4">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Why unmatched</div>
                      <div className="mt-2 space-y-1">
                        {Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                          <div key={k} className="flex items-center justify-between rounded border border-border bg-surface-2 px-2 py-1 text-[11px]">
                            <span>{reasonLabels[k] ?? k}</span>
                            <span className="num font-mono text-muted-foreground">{n}</span>
                          </div>
                        ))}
                      </div>
                      {samples.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Unmatched samples</div>
                          <div className="mt-1 overflow-hidden rounded border border-border">
                            <table className="w-full text-[11px]">
                              <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                                <tr>
                                  <th className="px-2 py-1 text-left">Address</th>
                                  <th className="px-2 py-1 text-left">APN</th>
                                  <th className="px-2 py-1 text-left">City</th>
                                  <th className="px-2 py-1 text-left">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {samples.map((s, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-2 py-1 font-mono">{s.address ?? "—"}</td>
                                    <td className="px-2 py-1 font-mono">{s.apn ?? "—"}</td>
                                    <td className="px-2 py-1">{s.city ?? "—"}</td>
                                    <td className="px-2 py-1 text-muted-foreground">{reasonLabels[s.reason] ?? s.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="mt-3 text-[11px] text-muted-foreground">{res.note}</div>
            </div>
          </section>
        );
      })()}


      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Scrapy Cloud ingest webhook</h2>
        <div className="mt-2 rounded-lg border border-border bg-surface p-3">
          <div className="text-[12px] text-muted-foreground">
            External Scrapy spiders (e.g. generated by Zyte's <code>/scrape</code> plugin) POST items here.
            Signed with HMAC-SHA256(<code>SCRAPY_INGEST_SECRET</code>, raw body) in the <code>x-signature</code> header.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-border bg-background px-2 py-1 text-[11px]">{webhookUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Webhook URL copied"); }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] hover:bg-surface">
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Full drop-in Scrapy pipeline in <code>docs/scrapy.md</code>. Recipes accepted:
            <span className="ml-1 font-mono text-foreground">foreclosure · probate · code_violation · sale · auction · parcel</span>
          </div>
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
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Scored parcels</div>
              <div className="mt-1 text-2xl font-semibold text-primary">
                {(cov.data?.live_totals?.scored ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">Underwritten by the engine.</div>
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
                {(cov.data?.counties.length ?? 0) === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-sm">No counties yet — click Scan live sources.</td></tr>
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

function Stat({ label, value, tone }: { label: string; value: any; tone?: "warn" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === "warn" ? "text-skeptic" : ""}`}>{value}</div>
    </div>
  );
}

function ConfBar({ label, pct, className, title }: { label: string; pct: number; className: string; title: string }) {
  if (pct <= 0) return null;
  return (
    <div
      className={`flex items-center justify-center overflow-hidden whitespace-nowrap px-1 ${className}`}
      style={{ width: `${pct}%` }}
      title={title}
    >
      {pct >= 8 ? label : ""}
    </div>
  );
}
