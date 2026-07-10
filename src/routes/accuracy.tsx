import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getCoverage } from "@/lib/parcels.functions";
import { PageHead } from "./deals";
import { fmt$ } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/accuracy")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/accuracy" } });
  },
  head: () => ({
    meta: [
      { title: "Accuracy — Layer 5 Learning Loop" },
      { name: "description", content: "The moat. Every completed flip becomes a test the machine grades against itself." },
    ],
  }),
  component: AccuracyPage,
});

function AccuracyPage() {
  const fn = useServerFn(getCoverage);
  const q = useQuery({ queryKey: ["coverage"], queryFn: () => fn() });
  const c = q.data;
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <PageHead title="Learning Loop · Layer 5" sub="Predicted-vs-actual, self-audited every night. Accuracy is measured hardest at the top of the rankings and published openly." />
      {c && (
        <>
          <div className="mt-8 grid grid-cols-4 gap-3">
            <BigStat label="Outcomes recorded" v={c.accuracy.total.toString()} />
            <BigStat label="Win rate" v={`${Math.round(c.accuracy.win_rate * 100)}%`} color="var(--profit-strong)" />
            <BigStat label="Losses" v={c.accuracy.losses.toString()} color="var(--skeptic)" />
            <BigStat label="Mean abs. ARV error" v={`${c.accuracy.mean_abs_error_pct.toFixed(1)}%`} />
          </div>

          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground">Recent outcomes</div>
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Sold</th>
                  <th className="px-4 py-2 text-left">Outcome</th>
                  <th className="px-4 py-2 text-right">Predicted ARV</th>
                  <th className="px-4 py-2 text-right">Actual sale</th>
                  <th className="px-4 py-2 text-right">Predicted profit</th>
                  <th className="px-4 py-2 text-right">Actual profit</th>
                  <th className="px-4 py-2 text-right">Error</th>
                </tr>
              </thead>
              <tbody>
                {c.outcomes.slice(0, 50).map((o: any, i: number) => (
                  <tr key={i} className="border-t border-border">
                    <td className="num px-4 py-2 text-muted-foreground">{o.actual_sold_at ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[11px]" style={{
                        color: o.outcome === "WIN" ? "var(--profit-strong)" : o.outcome === "LOSS" ? "var(--skeptic)" : "var(--muted-foreground)",
                        backgroundColor: "color-mix(in oklab, " + (o.outcome === "WIN" ? "var(--profit-strong)" : o.outcome === "LOSS" ? "var(--skeptic)" : "var(--muted-foreground)") + " 15%, transparent)",
                      }}>{o.outcome}</span>
                    </td>
                    <td className="num px-4 py-2 text-right">{fmt$(Number(o.predicted_arv))}</td>
                    <td className="num px-4 py-2 text-right">{fmt$(Number(o.actual_sale_price))}</td>
                    <td className="num px-4 py-2 text-right">{fmt$(Number(o.predicted_profit))}</td>
                    <td className="num px-4 py-2 text-right" style={{ color: Number(o.actual_profit) > 0 ? "var(--profit-strong)" : "var(--skeptic)" }}>{fmt$(Number(o.actual_profit))}</td>
                    <td className="num px-4 py-2 text-right text-muted-foreground">{Number(o.error_pct).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
            This dataset compounds. Year one it's a model. Year five it's the reference dataset for an industry — every predicted-vs-actual on every value-add residential transaction we cover, wins and losses alike.
          </p>
        </>
      )}
    </div>
  );
}

function BigStat({ label, v, color }: { label: string; v: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="num mt-1 text-3xl font-semibold" style={{ color }}>{v}</div>
    </div>
  );
}
