import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionBoundary } from "@/components/SectionBoundary";
import {
  getProductKpis,
  type ProductExperienceDaily,
  type ProductKpiDaily,
} from "@/lib/product-kpis.functions";

function formatRate(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value).toFixed(1)}%`;
}

function formatDuration(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 60) return `${Number(value).toFixed(1)}s`;
  return `${(Number(value) / 60).toFixed(1)}m`;
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p>
      <strong className="mt-3 block text-3xl font-semibold tracking-tight text-foreground">{value}</strong>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function Guardrail({ label, value, state = "neutral" }: { label: string; value: string; state?: "good" | "warn" | "neutral" }) {
  const tone = state === "good" ? "text-emerald-400" : state === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-md border border-border/70 bg-background/40 p-3">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className={`mt-1 block text-lg ${tone}`}>{value}</strong>
    </div>
  );
}

function FunnelRow({ row, experience }: { row: ProductKpiDaily; experience?: ProductExperienceDaily }) {
  return (
    <tr className="border-b border-border/60 text-[12px] text-muted-foreground">
      <td className="whitespace-nowrap px-3 py-3 text-foreground">{row.metric_date}</td>
      <td className="px-3 py-3 text-right num">{row.landing_sessions}</td>
      <td className="px-3 py-3 text-right num">{row.workspace_sessions}</td>
      <td className="px-3 py-3 text-right num">{row.evidence_sessions}</td>
      <td className="px-3 py-3 text-right num">{row.action_sessions}</td>
      <td className="px-3 py-3 text-right num text-foreground">{row.qualified_activations}</td>
      <td className="px-3 py-3 text-right num">{formatRate(row.qualified_activation_rate)}</td>
      <td className="px-3 py-3 text-right num">{formatDuration(row.median_seconds_to_action)}</td>
      <td className="px-3 py-3 text-right num">{experience?.p75_lcp_ms == null ? "—" : `${Number(experience.p75_lcp_ms).toFixed(0)}ms`}</td>
      <td className="px-3 py-3 text-right num">{experience?.media_error_sessions ?? 0}</td>
    </tr>
  );
}

function AnalyticsView() {
  const queryFn = useServerFn(getProductKpis);
  const query = useQuery({
    queryKey: ["product-kpis"],
    queryFn: () => queryFn(),
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading product KPIs…</div>;
  if (query.error) throw query.error;
  const data = query.data!;
  const latest = data.kpis[0];
  const latestExperience = data.experience.find((row) => row.metric_date === latest?.metric_date);
  const experienceByDate = new Map(data.experience.map((row) => [row.metric_date, row]));

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Decision intelligence</p>
          <h1 className="mt-2 text-2xl font-semibold">Product KPI control room</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Server-confirmed, same-market activation with privacy, experience, and underwriting-quality guardrails.</p>
        </div>
        <p className="text-[11px] text-muted-foreground">30-day window · refreshes every minute</p>
      </header>

      {!latest ? (
        <section className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <h2 className="font-medium">No eligible product sessions yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">The dashboard will populate after the analytics migration is deployed and a landing-to-workspace journey is recorded.</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Qualified activation" value={formatRate(latest.qualified_activation_rate)} detail={`${latest.qualified_activations} of ${latest.landing_sessions} landing sessions completed the ordered journey.`} />
            <KpiCard label="Landing → workspace" value={formatRate(latest.landing_to_workspace_rate)} detail={`${latest.workspace_sessions} sessions entered the decision workspace.`} />
            <KpiCard label="Evidence → action" value={formatRate(latest.evidence_to_action_rate)} detail="Requires evidence and a later server-confirmed action for the same market." />
            <KpiCard label="Median time to action" value={formatDuration(latest.median_seconds_to_action)} detail="From workspace entry to first confirmed underwrite or brief export." />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold">Experience guardrails</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Browser-native diagnostics; interaction latency is not labeled INP.</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Guardrail label="p75 LCP" value={latestExperience?.p75_lcp_ms == null ? "—" : `${Number(latestExperience.p75_lcp_ms).toFixed(0)}ms`} />
                <Guardrail label="p75 interaction" value={latestExperience?.p75_interaction_latency_ms == null ? "—" : `${Number(latestExperience.p75_interaction_latency_ms).toFixed(0)}ms`} />
                <Guardrail label="Average CLS" value={latestExperience?.average_cls == null ? "—" : Number(latestExperience.average_cls).toFixed(3)} />
                <Guardrail label="Media error sessions" value={String(latestExperience?.media_error_sessions ?? 0)} state={(latestExperience?.media_error_sessions ?? 0) > 0 ? "warn" : "good"} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold">Decision-quality guardrails</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Latest portfolio monitoring snapshot; never inferred from UI events.</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Guardrail label="Calibration slope" value={data.quality?.calibration_slope == null ? "—" : Number(data.quality.calibration_slope).toFixed(2)} state={data.quality?.calibration_flag === false ? "good" : data.quality?.calibration_flag ? "warn" : "neutral"} />
                <Guardrail label="Calibration flag" value={data.quality?.calibration_flag == null ? "—" : data.quality.calibration_flag ? "Review" : "Clear"} state={data.quality?.calibration_flag ? "warn" : "good"} />
                <Guardrail label="PSI band" value={data.quality?.psi_band ?? "—"} state={data.quality?.psi_band === "green" ? "good" : data.quality?.psi_band ? "warn" : "neutral"} />
                <Guardrail label="Risk appetite" value={data.quality == null ? "—" : data.quality.risk_appetite_breached ? "Breached" : "Within limits"} state={data.quality?.risk_appetite_breached ? "warn" : data.quality ? "good" : "neutral"} />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Daily measurement ledger</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Counts remain visible beside rates so small samples cannot masquerade as certainty.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-background/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>{["Date", "Landing", "Workspace", "Evidence", "Actions", "Qualified", "Activation", "Time", "p75 LCP", "Media errors"].map((label) => <th key={label} className={`px-3 py-2 font-medium ${label === "Date" ? "text-left" : "text-right"}`}>{label}</th>)}</tr>
                </thead>
                <tbody>{data.kpis.map((row) => <FunnelRow key={row.metric_date} row={row} experience={experienceByDate.get(row.metric_date)} />)}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AnalyticsError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return <div className="p-8 text-sm"><p className="text-destructive">{error.message}</p><button type="button" className="mt-3 rounded-md border border-border px-3 py-1" onClick={() => { router.invalidate(); reset(); }}>Retry</button></div>;
}

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Product KPIs — Perfect Property" }] }),
  component: () => <SectionBoundary label="Product KPI dashboard unavailable" minHeight={400}><AnalyticsView /></SectionBoundary>,
  errorComponent: AnalyticsError,
});
