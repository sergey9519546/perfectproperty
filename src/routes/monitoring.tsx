import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fmt$ } from "@/lib/format";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

const getLatestMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const { data, error } = await supabase
      .from("portfolio_metrics")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const Route = createFileRoute("/monitoring")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await browserSupabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/monitoring" } });
  },
  head: () => ({
    meta: [
      { title: "Portfolio Monitoring — Perfect Property Engine" },
      {
        name: "description",
        content:
          "Portfolio-level expected loss, VaR, CVaR, concentration, calibration and risk-appetite breach status.",
      },
    ],
  }),
  component: MonitoringPage,
});

function MonitoringPage() {
  const fetchMetrics = useServerFn(getLatestMetrics);
  const q = useQuery({ queryKey: ["portfolio-metrics"], queryFn: () => fetchMetrics() });

  const latest = q.data?.[0];
  const history = q.data ?? [];

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio Monitoring</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Nightly snapshot of portfolio-level expected loss, tail risk, concentration, calibration
          and risk-appetite budget.
        </p>
      </div>

      {q.isLoading && <div className="mt-6 text-sm text-muted-foreground">Loading metrics…</div>}
      {!q.isLoading && !latest && (
        <div className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          No monitoring snapshot yet. The nightly cron will populate this after its first run.
        </div>
      )}

      {latest && (
        <>
          <div className="mt-4 text-[11px] text-muted-foreground">
            Latest snapshot{" "}
            <span className="num text-foreground">
              {new Date(latest.computed_at).toLocaleString()}
            </span>
            {" · "}
            <span className="num">{latest.n_deals}</span> deals
          </div>

          {latest.risk_appetite_breached && (
            <div className="mt-4 rounded-lg border border-skeptic/40 bg-skeptic/10 p-4">
              <div className="text-[11px] uppercase tracking-widest text-skeptic">
                Risk appetite breached
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                {(latest.breach_reasons as string[]).map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-skeptic/40 bg-skeptic/15 px-2 py-0.5 text-skeptic"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Expected Loss" v={fmt$(Number(latest.el ?? 0))} tone="skeptic" />
            <Metric label="VaR (95%)" v={fmt$(Number(latest.var_95 ?? 0))} tone="opportunity" />
            <Metric label="CVaR (95%)" v={fmt$(Number(latest.cvar_95 ?? 0))} tone="skeptic" />
            <Metric label="Econ. Capital" v={fmt$(Number(latest.ec ?? 0))} />
            <Metric label="RAROC" v={fmtPct(Number(latest.raroc ?? 0))} />
            <Metric label="HHI (county)" v={Number(latest.hhi_county ?? 0).toFixed(3)} />
            <Metric label="HHI (scope)" v={Number(latest.hhi_scope ?? 0).toFixed(3)} />
            <Metric label="LCR" v={Number(latest.lcr ?? 0).toFixed(2)} />
            <Metric
              label="PSI"
              v={
                <span>
                  {Number(latest.psi ?? 0).toFixed(3)}{" "}
                  <span
                    className="ml-1 text-[10px] uppercase"
                    style={{ color: bandColor(latest.psi_band) }}
                  >
                    {latest.psi_band}
                  </span>
                </span>
              }
            />
            <Metric
              label="Calib. slope"
              v={Number(latest.calibration_slope ?? 1).toFixed(2)}
              tone={latest.calibration_flag ? "skeptic" : undefined}
            />
            <Metric
              label="Calib. intercept"
              v={Number(latest.calibration_intercept ?? 0).toFixed(2)}
            />
            <Metric label="Deals" v={<span className="num">{latest.n_deals}</span>} />
          </div>

          <div className="mt-8">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              History (last 30)
            </div>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Timestamp</th>
                    <th className="px-3 py-2 text-right">Deals</th>
                    <th className="px-3 py-2 text-right">EL</th>
                    <th className="px-3 py-2 text-right">CVaR</th>
                    <th className="px-3 py-2 text-right">EC</th>
                    <th className="px-3 py-2 text-right">HHI cty</th>
                    <th className="px-3 py-2 text-right">PSI</th>
                    <th className="px-3 py-2 text-left">Breach</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="num px-3 py-2 text-muted-foreground">
                        {new Date(h.computed_at).toLocaleString()}
                      </td>
                      <td className="num px-3 py-2 text-right">{h.n_deals}</td>
                      <td className="num px-3 py-2 text-right">{fmt$(Number(h.el ?? 0))}</td>
                      <td className="num px-3 py-2 text-right">{fmt$(Number(h.cvar_95 ?? 0))}</td>
                      <td className="num px-3 py-2 text-right">{fmt$(Number(h.ec ?? 0))}</td>
                      <td className="num px-3 py-2 text-right">
                        {Number(h.hhi_county ?? 0).toFixed(3)}
                      </td>
                      <td
                        className="num px-3 py-2 text-right"
                        style={{ color: bandColor(h.psi_band) }}
                      >
                        {Number(h.psi ?? 0).toFixed(3)}
                      </td>
                      <td
                        className="px-3 py-2 text-[11px]"
                        style={{
                          color: h.risk_appetite_breached
                            ? "var(--skeptic)"
                            : "var(--muted-foreground)",
                        }}
                      >
                        {h.risk_appetite_breached ? (h.breach_reasons as string[]).join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  v,
  tone,
}: {
  label: string;
  v: React.ReactNode;
  tone?: "skeptic" | "opportunity";
}) {
  const color =
    tone === "skeptic"
      ? "var(--skeptic)"
      : tone === "opportunity"
        ? "var(--opportunity)"
        : undefined;
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="num mt-1 text-xl font-semibold" style={{ color }}>
        {v}
      </div>
    </div>
  );
}

function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}
function bandColor(band: string | null): string {
  switch (band) {
    case "green":
      return "var(--profit-strong)";
    case "yellow":
      return "var(--opportunity)";
    case "orange":
      return "var(--opportunity)";
    case "red":
      return "var(--skeptic)";
    default:
      return "var(--muted-foreground)";
  }
}
