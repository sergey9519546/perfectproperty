import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPipelineHealth } from "@/lib/health.functions";
import { getZyteStatus, scheduleZyteJob } from "@/lib/zyte.functions";
import { getOrchestratorStats } from "@/lib/parcels.functions";
import { SectionBoundary } from "@/components/SectionBoundary";
import { DataFreshness } from "@/components/DataFreshness";

function statusColor(s: string): string {
  if (s === "green") return "bg-profit-strong";
  if (s === "yellow") return "bg-amber-400";
  return "bg-destructive";
}

function Card({ title, value, sub }: { title: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-semibold num text-foreground">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function HealthView() {
  const fn = useServerFn(getPipelineHealth);
  const q = useQuery({
    queryKey: ["pipeline-health"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  if (q.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading health…</div>;
  if (q.error) throw q.error;
  const d = q.data!;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ingestion health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of every county source, ingest failures, and API activity.
          </p>
        </div>
        <DataFreshness timestamp={new Date()} prefix="Refreshed" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card
          title="Ingested (24h)"
          value={d.total_ingested_24h.toLocaleString()}
          sub="parcels upserted from live sources"
        />
        <Card
          title="Failures (24h)"
          value={d.total_failed_24h.toLocaleString()}
          sub="rows sent to the dead-letter queue"
        />
        <Card
          title="Realie requests today"
          value={d.realie_calls_today.toLocaleString()}
          sub={`${d.realie_calls_remaining.toLocaleString()} remaining of ${d.realie_daily_call_limit.toLocaleString()} · includes retries`}
        />
        <Card
          title="Sources tracked"
          value={d.sources.length}
          sub="green / yellow / red rings below"
        />
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold">Enrichment pipeline (Realie)</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Parcels queued for address enrichment because they gained a distress event or listing
              but are missing key attributes. The cron endpoint{" "}
              <code className="rounded bg-surface-2 px-1">/api/public/run-realie-enrichment</code>{" "}
              drains this queue.
            </p>
          </div>
          {d.last_realie_run && (
            <div className="text-[11px] text-muted-foreground">
              last run <DataFreshness timestamp={d.last_realie_run} prefix="" />
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Card title="Pending" value={d.enrichment.pending} />
          <Card title="Inflight" value={d.enrichment.inflight} />
          <Card title="Done" value={d.enrichment.done} />
          <Card title="Failed" value={d.enrichment.failed} />
          <Card title="Total in queue" value={d.enrichment.total} />
          <Card title="Enriched (24h)" value={d.realie_enriched_24h} sub="via cron worker" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {Object.entries(d.enrichment.by_reason).map(([reason, n]) => (
            <span
              key={reason}
              className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-muted-foreground"
              title={`${n} pending or inflight items with reason "${reason}"`}
            >
              {reason} <span className="num text-foreground">{n as number}</span>
            </span>
          ))}
        </div>
        {(d.realie_usage_by_endpoint ?? []).length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Today by endpoint
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {d.realie_usage_by_endpoint.map((usage: any) => (
                <span
                  key={usage.endpoint}
                  className="rounded border border-border bg-surface-2 px-2 py-1 text-muted-foreground"
                >
                  <span className="font-mono text-foreground">{usage.endpoint}</span>{" "}
                  {Number(usage.request_count).toLocaleString()} requests ·{" "}
                  {Number(usage.property_count).toLocaleString()} properties ·{" "}
                  {Number(usage.failure_count).toLocaleString()} failed
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Source health</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Circuit breaker state. Red means the ingest cron skips the source until it recovers.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {d.sources.length === 0 && (
            <div className="text-[12px] text-muted-foreground">
              No health data yet — run an ingest.
            </div>
          )}
          {d.sources.map((s: any) => (
            <div
              key={s.source_key}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${statusColor(s.status)}`} />
                <div>
                  <div className="text-[13px] font-medium">{s.source_key}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.consecutive_failures > 0
                      ? `${s.consecutive_failures} recent failure(s)`
                      : "healthy"}
                    {s.last_error ? ` · ${s.last_error}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                {s.tripped_until && (
                  <div>tripped until {new Date(s.tripped_until).toLocaleTimeString()}</div>
                )}
                {s.last_ok_at && (
                  <div>
                    OK <DataFreshness timestamp={s.last_ok_at} prefix="" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Recent failures</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Every parcel/source that couldn't be scored, fetched, or underwritten.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-2">When</th>
                <th className="pb-2">Source</th>
                <th className="pb-2">Stage</th>
                <th className="pb-2">County</th>
                <th className="pb-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {d.recent_failures.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No failures — clean pipeline.
                  </td>
                </tr>
              )}
              {d.recent_failures.map((f: any) => (
                <tr key={f.id} className="border-t border-border/40">
                  <td className="py-2 whitespace-nowrap">
                    <DataFreshness timestamp={f.created_at} prefix="" />
                  </td>
                  <td className="py-2 font-mono text-[11px]">{f.source}</td>
                  <td className="py-2">{f.stage}</td>
                  <td className="py-2 font-mono text-[11px]">{f.county_fips ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">{f.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <OrchestratorPanel />
      <ZytePanel />
    </div>
  );
}

function OrchestratorPanel() {
  const fn = useServerFn(getOrchestratorStats);
  const q = useQuery({
    queryKey: ["orchestrator-stats"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });
  if (q.isLoading || !q.data) return null;
  const d = q.data as any;
  const cfg = d.config ?? {};
  const today = d.today ?? {};
  const spend = Number(today.zyte_spent_usd ?? 0);
  const budget = Number(cfg.zyte_daily_budget_usd ?? 25);
  const pctUsed = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;

  const counties = Object.keys(d.coverage_matrix ?? {}).sort();
  const sourceKinds = Array.from(
    new Set(counties.flatMap((c: string) => Object.keys(d.coverage_matrix[c] ?? {}))),
  ).sort();

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold">Scrapy orchestrator</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Priority-weighted target queue. Scrapy pulls from{" "}
            <code className="rounded bg-surface-2 px-1">/api/public/next-scrape-targets</code> and
            reports back to{" "}
            <code className="rounded bg-surface-2 px-1">/api/public/scrape-run-complete</code>.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card
          title="Zyte spend today"
          value={`$${spend.toFixed(2)}`}
          sub={`of $${budget.toFixed(0)} budget`}
        />
        <Card title="Requests today" value={Number(today.requests_made ?? 0).toLocaleString()} />
        <Card
          title="Triggers produced"
          value={Number(today.triggers_produced ?? 0).toLocaleString()}
          sub="distress+listing rows"
        />
        <Card title="Blocked runs" value={Number(today.blocks ?? 0).toLocaleString()} />
        <Card title="Targets tracked" value={(d.targets ?? []).length.toLocaleString()} />
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-surface-2">
        <div
          className={`h-full ${pctUsed >= 90 ? "bg-destructive" : pctUsed >= 60 ? "bg-amber-400" : "bg-profit-strong"}`}
          style={{ width: `${pctUsed}%` }}
        />
      </div>

      {counties.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Coverage matrix — hours since last success (blank = never)
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">County</th>
                  {sourceKinds.map((k) => (
                    <th key={k} className="pb-2 pr-3 text-right">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {counties.slice(0, 20).map((c) => (
                  <tr key={c} className="border-t border-border/40">
                    <td className="py-1.5 pr-3 font-mono">{c}</td>
                    {sourceKinds.map((k) => {
                      const h = d.coverage_matrix[c]?.[k];
                      const color =
                        h == null
                          ? "text-destructive"
                          : h < 24
                            ? "text-profit-strong"
                            : h < 168
                              ? "text-amber-400"
                              : "text-destructive";
                      return (
                        <td key={k} className={`py-1.5 pr-3 text-right num ${color}`}>
                          {h == null
                            ? "—"
                            : h < 24
                              ? `${h.toFixed(1)}h`
                              : `${(h / 24).toFixed(1)}d`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(d.targets ?? []).length === 0 && (
        <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-[11px] text-muted-foreground">
          No scrape targets configured yet. Seed <code>public.scrape_targets</code> with county ×
          source_kind rows so the orchestrator has something to hand out.
        </div>
      )}
    </section>
  );
}

function ZytePanel() {
  const fn = useServerFn(getZyteStatus);
  const schedule = useServerFn(scheduleZyteJob);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["zyte-status"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });
  const m = useMutation({
    mutationFn: (v: { spider: string; recipe?: string }) => schedule({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zyte-status"] }),
  });

  if (q.isLoading) return null;
  const d = q.data;
  if (!d) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold">Zyte / Scrapy Cloud</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {d.enabled ? (
              <>
                Project <span className="font-mono">{d.project}</span> · fallback fetcher active for
                blocked county sources.
              </>
            ) : (
              <>
                Not configured. Add <span className="font-mono">ZYTE_API_KEY</span> to enable the
                anti-bot fallback.
              </>
            )}
          </p>
        </div>
        {d.enabled && (
          <div className="flex gap-2">
            <ScheduleButton
              onSchedule={(spider, recipe) => m.mutate({ spider, recipe })}
              pending={m.isPending}
            />
          </div>
        )}
      </div>
      {d.error && <div className="mt-2 text-[11px] text-destructive">{d.error}</div>}
      {m.error && (
        <div className="mt-2 text-[11px] text-destructive">
          {String((m.error as Error).message)}
        </div>
      )}
      {m.data && (
        <div className="mt-2 text-[11px] text-muted-foreground">Scheduled job {m.data.jobid}</div>
      )}

      {d.enabled && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-2">Job</th>
                <th className="pb-2">Spider</th>
                <th className="pb-2">State</th>
                <th className="pb-2 text-right">Items</th>
                <th className="pb-2 text-right">Errors</th>
                <th className="pb-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {d.jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    No recent Scrapy Cloud jobs.
                  </td>
                </tr>
              )}
              {d.jobs.map((j: any) => (
                <tr key={j.id} className="border-t border-border/40">
                  <td className="py-2 font-mono text-[11px]">{j.id}</td>
                  <td className="py-2">{j.spider}</td>
                  <td className="py-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full mr-2 ${
                        j.state === "finished" && j.close_reason === "finished"
                          ? "bg-profit-strong"
                          : j.state === "running"
                            ? "bg-amber-400"
                            : j.close_reason && j.close_reason !== "finished"
                              ? "bg-destructive"
                              : "bg-muted-foreground"
                      }`}
                    />
                    {j.state}
                    {j.close_reason && j.close_reason !== "finished" ? ` · ${j.close_reason}` : ""}
                  </td>
                  <td className="py-2 text-right num">{j.items_scraped.toLocaleString()}</td>
                  <td className="py-2 text-right num">
                    {j.errors_count > 0 ? (
                      <span className="text-destructive">{j.errors_count}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {j.started_time ? <DataFreshness timestamp={j.started_time} prefix="" /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ScheduleButton({
  onSchedule,
  pending,
}: {
  onSchedule: (spider: string, recipe?: string) => void;
  pending: boolean;
}) {
  return (
    <button
      disabled={pending}
      onClick={() => {
        const spider = window.prompt("Spider name to schedule (as configured in Scrapy Cloud):");
        if (!spider) return;
        const recipe =
          window.prompt(
            "Recipe (foreclosure | probate | code_violation | sale | parcel):",
            "foreclosure",
          ) ?? undefined;
        onSchedule(spider.trim(), recipe?.trim() || undefined);
      }}
      className="rounded-md border border-border px-3 py-1 text-[11px] hover:bg-muted/40 disabled:opacity-50"
    >
      {pending ? "Scheduling…" : "Schedule job"}
    </button>
  );
}

function HealthPage() {
  return (
    <SectionBoundary label="Health dashboard unavailable" minHeight={400}>
      <HealthView />
    </SectionBoundary>
  );
}

function HealthError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="p-8 text-sm">
      <div className="text-destructive">{error.message}</div>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-3 rounded-md border border-border px-3 py-1"
      >
        Retry
      </button>
    </div>
  );
}

export const Route = createFileRoute("/admin/health")({
  head: () => ({ meta: [{ title: "Pipeline health — Perfect Property" }] }),
  component: HealthPage,
  errorComponent: HealthError,
  notFoundComponent: () => <div className="p-8 text-sm">Not found.</div>,
});
