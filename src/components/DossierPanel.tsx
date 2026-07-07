import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDossier } from "@/lib/parcels.functions";
import { fmt$, pct, tierLabel } from "@/lib/format";
import { X, TrendingUp, AlertTriangle, Building2, ScrollText, Zap, Activity } from "lucide-react";

interface Props {
  parcelId: string | null;
  onClose: () => void;
}

export function DossierPanel({ parcelId, onClose }: Props) {
  const fetchDossier = useServerFn(getDossier);
  const q = useQuery({
    queryKey: ["dossier", parcelId],
    queryFn: () => fetchDossier({ data: { parcel_id: parcelId! } }),
    enabled: !!parcelId,
  });

  if (!parcelId) return null;

  return (
    <aside className="pointer-events-auto fixed inset-y-14 right-0 z-30 w-full max-w-[520px] overflow-y-auto border-l border-border-strong bg-surface shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Dossier</div>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Underwriting the parcel…</div>}

      {q.data && (
        <div className="space-y-6 p-5">
          <Header d={q.data} />
          <ScoreStrip d={q.data} />
          <ValueLadder d={q.data} />
          <MonteCarloBlock d={q.data} />
          <OfferCurve d={q.data} />
          <ExitForecast d={q.data} />
          <SkepticBlock d={q.data} />
          <TransactionHistory d={q.data} />
          <DistressLog d={q.data} />
          <Verdict d={q.data} />
        </div>
      )}
    </aside>
  );
}

type D = Awaited<ReturnType<typeof getDossier>>;

function Header({ d }: { d: D }) {
  const p = d.parcel;
  return (
    <div>
      <div className="text-lg font-semibold leading-tight">{p.address}</div>
      <div className="text-sm text-muted-foreground">{p.city}, {p.state} {p.zip}</div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-muted-foreground">
        <Cell label="Beds/Ba" value={`${p.bedrooms ?? "—"}/${p.bathrooms ?? "—"}`} />
        <Cell label="Sqft" value={<span className="num">{p.living_sqft?.toLocaleString() ?? "—"}</span>} />
        <Cell label="Built" value={<span className="num">{p.year_built ?? "—"}</span>} />
        <Cell label="Cond" value={p.condition_grade ?? "—"} />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function ScoreStrip({ d }: { d: D }) {
  const s = d.score;
  if (!s) return <div className="text-sm text-muted-foreground">No score computed yet.</div>;
  const tier = tierLabel(Number(s.perfect_score));
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2 rounded-lg border border-border bg-surface-2 p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Perfect Score</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="num text-4xl font-semibold" style={{ color: tier.color }}>{s.perfect_score}</div>
          <div className="text-xs" style={{ color: tier.color }}>{tier.label}</div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>Confidence <span className="num text-foreground">{s.confidence_grade}</span></span>
          <span>·</span>
          <span>Ring <span className="num text-foreground">{s.ring}</span></span>
          <span>·</span>
          <span>Scope <span className="text-foreground">{s.recommended_scope}</span></span>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk-Adj. Profit</div>
        <div className="num mt-1 text-2xl font-semibold text-profit-strong">{fmt$(Number(s.risk_adjusted_profit))}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">Gross <span className="num text-foreground">{fmt$(Number(s.gross_profit))}</span></div>
      </div>
    </div>
  );
}

function ValueLadder({ d }: { d: D }) {
  const s = d.score; if (!s) return null;
  const rungs = [
    { label: "As-Is", value: Number(s.as_is_value) },
    { label: "Cosmetic ARV", value: Number(s.cosmetic_arv) },
    { label: "Full Reno ARV", value: Number(s.full_reno_arv) },
    { label: "Expanded ARV", value: Number(s.expanded_arv) },
  ];
  const max = Math.max(...rungs.map((r) => r.value));
  const arvSource = (s as any).arv_source ?? "HEURISTIC";
  const compCount = Number((s as any).comp_count ?? 0);
  const comps = ((s as any).comps_used as any[]) ?? [];
  return (
    <section>
      <SectionHead icon={<Building2 className="h-3.5 w-3.5" />} title="Value Ladder" />
      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest">
        <span className="rounded-full px-2 py-0.5" style={{
          color: arvSource === "COMPS" ? "var(--profit-strong)" : "var(--muted-foreground)",
          backgroundColor: arvSource === "COMPS" ? "color-mix(in oklab, var(--profit-strong) 15%, transparent)" : "var(--surface-2)",
        }}>
          {arvSource === "COMPS" ? `ARV from ${compCount} real comps` : "ARV from heuristic (no comps yet)"}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {rungs.map((r) => {
          const isRec = (s.recommended_scope === "COSMETIC" && r.label === "Cosmetic ARV") ||
            (s.recommended_scope === "FULL" && r.label === "Full Reno ARV") ||
            (s.recommended_scope === "EXPANDED" && r.label === "Expanded ARV");
          return (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-28 text-[11px] text-muted-foreground">{r.label}</div>
              <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-surface-2">
                <div className="h-full" style={{
                  width: `${(r.value / max) * 100}%`,
                  background: isRec ? "var(--opportunity)" : "var(--surface-3)",
                }} />
              </div>
              <div className="num w-24 text-right text-[12px]">{fmt$(r.value)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <MiniStat label="Reno" v={fmt$(Number(s.reno_cost))} />
        <MiniStat label="Carry" v={fmt$(Number(s.carry_cost))} />
        <MiniStat label="Selling" v={fmt$(Number(s.selling_cost))} />
      </div>
      {comps.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Comps used</div>
          <div className="mt-1 overflow-hidden rounded-md border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Address</th>
                  <th className="px-2 py-1 text-right">Sold</th>
                  <th className="px-2 py-1 text-right">Price</th>
                  <th className="px-2 py-1 text-right">$/sf</th>
                  <th className="px-2 py-1 text-right">Dist</th>
                </tr>
              </thead>
              <tbody>
                {comps.slice(0, 8).map((c: any, i: number) => (
                  <tr key={c.sale_id ?? i} className="border-t border-border">
                    <td className="truncate px-2 py-1">{c.address ?? "—"}</td>
                    <td className="num px-2 py-1 text-right text-muted-foreground">{String(c.sold_at ?? "").slice(0, 7)}</td>
                    <td className="num px-2 py-1 text-right">{fmt$(Number(c.sale_price))}</td>
                    <td className="num px-2 py-1 text-right">${Math.round(Number(c.ppsf))}</td>
                    <td className="num px-2 py-1 text-right text-muted-foreground">{Number(c.distance_km).toFixed(2)}km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function OfferCurve({ d }: { d: D }) {
  const s = d.score; if (!s) return null;
  // Rebuild the offer curve from the modeled offer (simple derived view)
  const offer = Number(s.modeled_offer);
  const arv = Number(s.recommended_scope === "COSMETIC" ? s.cosmetic_arv : s.recommended_scope === "FULL" ? s.full_reno_arv : s.expanded_arv);
  const reno = Number(s.reno_cost); const carry = Number(s.carry_cost); const sell = Number(s.selling_cost);
  const base = Number(s.acquisition_probability);
  const rows = [-0.08, -0.04, 0, 0.05, 0.1].map((delta) => {
    const o = Math.round(offer * (1 + delta));
    const p = Math.round(arv - o - reno - carry - sell);
    const pr = Math.min(0.98, Math.max(0.02, base * (1 + delta * 3)));
    return { offer: o, profit: p, prob: pr, delta };
  });
  return (
    <section>
      <SectionHead icon={<TrendingUp className="h-3.5 w-3.5" />} title="Offer Curve — where three curves cross" />
      <div className="mt-2 overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Offer</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">P(accept)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.delta === 0 ? "bg-surface-2/60" : ""}>
                <td className="num border-t border-border px-3 py-2">{fmt$(r.offer)}</td>
                <td className="num border-t border-border px-3 py-2 text-right" style={{ color: r.profit > 0 ? "var(--profit-strong)" : "var(--skeptic)" }}>{fmt$(r.profit)}</td>
                <td className="num border-t border-border px-3 py-2 text-right">{pct(r.prob)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExitForecast({ d }: { d: D }) {
  const s = d.score; if (!s) return null;
  return (
    <section>
      <SectionHead icon={<Zap className="h-3.5 w-3.5" />} title="Exit Velocity" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <MiniStat label="Days on market (renovated)" v={<span className="num">{s.exit_days}</span>} />
        <MiniStat label="Exit confidence" v={pct(Number(s.exit_confidence))} />
      </div>
    </section>
  );
}

function SkepticBlock({ d }: { d: D }) {
  const s = d.score; if (!s) return null;
  const flags = (s.skeptic_flags as string[]) ?? [];
  if (flags.length === 0) return (
    <section>
      <SectionHead icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Skeptic report" />
      <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">No red flags surfaced. Standard due diligence still required.</div>
    </section>
  );
  return (
    <section>
      <SectionHead icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Skeptic report" />
      <ul className="mt-2 space-y-1.5">
        {flags.map((f, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md border border-skeptic/30 bg-skeptic/8 px-3 py-2 text-[12px] text-foreground" style={{ backgroundColor: "color-mix(in oklab, var(--skeptic) 10%, transparent)", borderColor: "color-mix(in oklab, var(--skeptic) 40%, transparent)" }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-skeptic" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TransactionHistory({ d }: { d: D }) {
  return (
    <section>
      <SectionHead icon={<ScrollText className="h-3.5 w-3.5" />} title={`Transaction bloodline (${d.deeds.length})`} />
      <div className="mt-2 space-y-1">
        {d.deeds.length === 0 && <div className="text-[12px] text-muted-foreground">No recorded deeds in the genome.</div>}
        {d.deeds.map((x) => (
          <div key={x.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px]">
            <span className="num text-muted-foreground">{x.recorded_at}</span>
            <span className="text-[11px] uppercase text-muted-foreground">{x.deed_type}</span>
            <span className="num text-foreground">{x.sale_price ? fmt$(Number(x.sale_price)) : "—"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DistressLog({ d }: { d: D }) {
  if (d.distress.length === 0) return null;
  return (
    <section>
      <SectionHead icon={<AlertTriangle className="h-3.5 w-3.5" />} title={`Legal weather (${d.distress.length})`} />
      <div className="mt-2 space-y-1">
        {d.distress.map((x) => (
          <div key={x.id} className="rounded-md border px-3 py-2 text-[12px]" style={{ backgroundColor: "color-mix(in oklab, var(--shadow-ring) 8%, transparent)", borderColor: "color-mix(in oklab, var(--shadow-ring) 30%, transparent)" }}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{x.event_type.replace(/_/g, " ")}</span>
              <span className="num text-muted-foreground">{x.event_date}</span>
            </div>
            {x.amount && <div className="num mt-1 text-[11px] text-muted-foreground">Amount {fmt$(Number(x.amount))}</div>}
            {x.auction_date && <div className="num mt-1 text-[11px] text-opportunity">Auction {x.auction_date}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Verdict({ d }: { d: D }) {
  const s = d.score; if (!s) return null;
  const gp = Number(s.gross_profit);
  const line = gp > 40000
    ? `Buy at ${fmt$(Number(s.modeled_offer))} or below. ${s.recommended_scope.toLowerCase()} scope. Skeptic clears.`
    : gp > 12000
      ? `Marginal deal at ${fmt$(Number(s.modeled_offer))}. Only if operator has efficient ${s.recommended_scope.toLowerCase()} crew.`
      : `Pass. Numbers do not survive pessimism.`;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">One-line verdict</div>
      <div className="mt-1 text-[14px] font-medium leading-snug">{line}</div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function MiniStat({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[13px] text-foreground">{v}</div>
    </div>
  );
}
