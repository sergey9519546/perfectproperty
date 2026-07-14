import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { discoverSchema, saveRecipe, listRecipes, runRecipe, deleteRecipe } from "@/lib/recipes.functions";
import { Play, Trash, X, Warning } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface WizardState {
  url: string;
  candidates: any[];
  base_url: string;
  selectedIdx: number;
  name: string;
  target: "distress_events" | "sales" | "parcels";
}

interface RunReportState {
  recipe_id: string;
  recipe_name: string;
  result: any;
}

/**
 * Self-contained recipe management: schema-discovery wizard, saved-recipes table
 * with run/delete actions, and a run-report panel with match-confidence breakdown.
 * Receives `discoverUrl` from the parent (ProbePanel handoff) and triggers discovery.
 */
export function RecipeManager({
  discoverUrl,
  onDiscoverConsumed,
}: {
  discoverUrl: string | null;
  onDiscoverConsumed: () => void;
}) {
  const discoverFn = useServerFn(discoverSchema);
  const saveFn = useServerFn(saveRecipe);
  const listFn = useServerFn(listRecipes);
  const runFn = useServerFn(runRecipe);
  const delFn = useServerFn(deleteRecipe);
  const qc = useQueryClient();

  const recipes = useQuery({ queryKey: ["recipes"], queryFn: () => listFn() });
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [runReport, setRunReport] = useState<RunReportState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const discover = useMutation({
    mutationFn: (url: string) => discoverFn({ data: { url } }),
    onSuccess: (r: any, url: string) => {
      if (!r.candidates.length) {
        toast.error("No repeating containers found — try a listing page");
        return;
      }
      setWizard({
        url,
        candidates: r.candidates,
        base_url: r.base_url,
        selectedIdx: 0,
        name: `Recipe ${new Date().toISOString().slice(0, 10)}`,
        target: "distress_events",
      });
    },
    onError: (e: Error) => toast.error(e.message ?? "Discovery failed"),
  });

  // Watch for discoverUrl from ProbePanel handoff
  useEffect(() => {
    if (!discoverUrl) return;
    discover.mutate(discoverUrl);
    onDiscoverConsumed();
  }, [discoverUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRec = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Recipe saved");
      setWizard(null);
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });

  const runRec = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      runFn({ data: { id: v.id, max_rows: 500 } }).then((r) => ({ ...v, result: r })),
    onSuccess: (r: any) => {
      setRunReport({ recipe_id: r.id, recipe_name: r.name, result: r.result });
      toast.success(`${r.name}: ${r.result.note}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message ?? "Run failed"),
  });

  const delRec = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Recipe deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  return (
    <>
      {wizard && <RecipeWizard wizard={wizard} setWizard={setWizard} saveRec={saveRec} />}

      {/* Saved recipes table */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Saved recipes</h2>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {recipes.data?.length ?? 0} total
          </span>
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
                  <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={r.source_url}>
                    {r.source_url}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[10px] text-muted-foreground" title={r.container_selector}>
                    {r.container_selector}
                  </td>
                  <td className="num px-3 py-2 text-right">{(r.fields ?? []).length}</td>
                  <td className="num px-3 py-2 text-right text-muted-foreground">
                    {r.last_run_at ? `${r.last_run_rows ?? 0} · ${new Date(r.last_run_at).toLocaleDateString()}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => runRec.mutate({ id: r.id, name: r.name })}
                      disabled={runRec.isPending}
                      className="mr-1 inline-flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-[11px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <Play className="h-3 w-3" /> Run
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
                      className="rounded border border-border p-1 text-skeptic transition-colors hover:bg-skeptic/10"
                      aria-label={`Delete ${r.name}`}
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {(recipes.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                    No recipes yet — probe a URL and click Discover schema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {runReport && <RunReport report={runReport} onDismiss={() => setRunReport(null)} />}

      {/* Delete confirmation dialog (replaces native confirm()) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-4 w-4 text-skeptic" />
              Delete recipe?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleteTarget?.name}</strong> and its field mappings.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && delRec.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete recipe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------- Recipe Wizard sub-component ---------- */

function RecipeWizard({
  wizard,
  setWizard,
  saveRec,
}: {
  wizard: WizardState;
  setWizard: (w: WizardState | null) => void;
  saveRec: { mutate: (p: any) => void; isPending: boolean };
}) {
  const cand = wizard.candidates[wizard.selectedIdx];
  if (!cand) return null;

  const updateField = (idx: number, patch: Partial<{ name: string; type: string }>) => {
    const cs = [...wizard.candidates];
    const nc = { ...cand, fields: [...cand.fields] };
    nc.fields[idx] = { ...nc.fields[idx], ...patch };
    cs[wizard.selectedIdx] = nc;
    setWizard({ ...wizard, candidates: cs });
  };

  const removeField = (idx: number) => {
    const cs = [...wizard.candidates];
    cs[wizard.selectedIdx] = { ...cand, fields: cand.fields.filter((_: any, j: number) => j !== idx) };
    setWizard({ ...wizard, candidates: cs });
  };

  return (
    <section className="mt-8">
      <div className="rounded-lg border border-opportunity/50 bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-widest text-opportunity">Schema wizard · approve extraction</h2>
          <button onClick={() => setWizard(null)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <X size={12} aria-hidden="true" /> Close
          </button>
        </div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{wizard.url}</div>

        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Candidate containers ({wizard.candidates.length})
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {wizard.candidates.map((c: any, i: number) => (
              <button
                key={i}
                onClick={() => setWizard({ ...wizard, selectedIdx: i })}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  i === wizard.selectedIdx ? "border-opportunity bg-opportunity/10" : "border-border bg-surface-2 hover:bg-surface-3"
                }`}
              >
                <span className="font-mono">{c.container_selector}</span>
                <span className="ml-2 text-muted-foreground">x{c.sample_count} · s{c.score}</span>
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
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    className="w-28 rounded border border-border bg-background px-1 py-0.5 font-mono outline-none focus:border-primary"
                  />
                  <select
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value })}
                    className="rounded border border-border bg-background px-1 py-0.5 outline-none"
                  >
                    <option value="text">text</option>
                    <option value="date">date</option>
                    <option value="money">money</option>
                    <option value="url">url</option>
                    <option value="number">number</option>
                  </select>
                  <div className="flex-1 truncate text-muted-foreground" title={f.sample}>{f.sample}</div>
                  <button
                    onClick={() => removeField(i)}
                    aria-label="Remove field"
                    className="text-skeptic transition-colors hover:text-skeptic/70"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample row</div>
            <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface-2 p-2 text-[10px]">
              {cand.sample_row_text}
            </pre>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={wizard.name}
            onChange={(e) => setWizard({ ...wizard, name: e.target.value })}
            className="w-64 rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary"
            placeholder="Recipe name"
          />
          <select
            value={wizard.target}
            onChange={(e) => setWizard({ ...wizard, target: e.target.value as WizardState["target"] })}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none"
          >
            <option value="distress_events">distress_events</option>
            <option value="sales">sales</option>
            <option value="parcels">parcels</option>
          </select>
          <button
            onClick={() =>
              saveRec.mutate({
                name: wizard.name,
                target_table: wizard.target,
                source_url: wizard.url,
                container_selector: cand.container_selector,
                fields: cand.fields,
              })
            }
            disabled={saveRec.isPending}
            className="rounded-md bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saveRec.isPending ? "Saving…" : "Save recipe"}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Run Report sub-component ---------- */

const REASON_LABELS: Record<string, string> = {
  no_address_or_apn: "No address or APN in row",
  no_county_or_city_scope: "Missing county FIPS + city (can't scope match)",
  apn_not_found_in_county: "APN not in county parcels",
  address_not_found: "Address didn't normalize to a parcel",
};

function RunReport({ report, onDismiss }: { report: RunReportState; onDismiss: () => void }) {
  const res = report.result ?? {};
  const mb = res.match_breakdown ?? { apn_county: 0, addr_county: 0, addr_city: 0 };
  const totalMatched = (mb.apn_county ?? 0) + (mb.addr_county ?? 0) + (mb.addr_city ?? 0);
  const denom = totalMatched + (res.unmatched ?? 0);
  const pctOf = (n: number) => (denom > 0 ? Math.round((n / denom) * 100) : 0);
  const reasons: Record<string, number> = res.unmatched_reasons ?? {};
  const samples: any[] = res.unmatched_samples ?? [];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Last run · {report.recipe_name}
        </h2>
        <button onClick={onDismiss} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          Dismiss
        </button>
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
                  <ConfBar label={`APN+County ${mb.apn_county}`} pct={pctOf(mb.apn_county)} className="bg-emerald-500/80 text-white" title="Highest confidence: exact APN match within county" />
                  <ConfBar label={`Addr+County ${mb.addr_county}`} pct={pctOf(mb.addr_county)} className="bg-primary/80 text-primary-foreground" title="High confidence: normalized address + county" />
                  <ConfBar label={`Addr+City ${mb.addr_city}`} pct={pctOf(mb.addr_city)} className="bg-amber-500/80 text-white" title="Medium confidence: normalized address + city" />
                  <ConfBar label={`Unmatched ${res.unmatched}`} pct={pctOf(res.unmatched)} className="bg-skeptic/70 text-white" title="No parcel resolved" />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded bg-emerald-500/80" />APN+County (highest)</span>
                <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded bg-primary/80" />Addr+County (high)</span>
                <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded bg-amber-500/80" />Addr+City (medium)</span>
                <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded bg-skeptic/70" />Unmatched</span>
              </div>
            </div>

            {Object.keys(reasons).length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Why unmatched</div>
                <div className="mt-2 space-y-1">
                  {Object.entries(reasons)
                    .sort(([, a], [, b]) => b - a)
                    .map(([k, n]) => (
                      <div key={k} className="flex items-center justify-between rounded border border-border bg-surface-2 px-2 py-1 text-[11px]">
                        <span>{REASON_LABELS[k] ?? k}</span>
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
                              <td className="px-2 py-1 text-muted-foreground">{REASON_LABELS[s.reason] ?? s.reason}</td>
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
}

/* ---------- Shared helpers ---------- */

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