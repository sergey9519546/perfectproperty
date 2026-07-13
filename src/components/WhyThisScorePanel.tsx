import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getFieldProvenance } from "@/lib/parcels.functions";
import { ChevronDown, ChevronRight } from "lucide-react";

const FIELD_LABEL: Record<string, string> = {
  living_sqft: "Living sqft",
  year_built: "Year built",
  beds: "Beds",
  baths: "Baths",
  lot_sqft: "Lot sqft",
  assessed_value: "Assessed value",
  owner_name: "Owner",
  property_type: "Type",
  lat: "Latitude",
  lng: "Longitude",
  condition_grade: "Condition",
  flood_zone: "Flood zone",
  last_sale_price: "Last sale $",
  last_sale_date: "Last sale date",
};

const DRIVER_ORDER = [
  "living_sqft", "year_built", "beds", "baths", "lot_sqft",
  "assessed_value", "condition_grade", "flood_zone",
  "last_sale_price", "last_sale_date", "owner_name", "property_type",
];

function confidenceColor(c: number): string {
  if (c >= 0.85) return "bg-profit-strong";
  if (c >= 0.65) return "bg-amber-400";
  return "bg-destructive";
}

function confidenceBand(c: number | null | undefined): string {
  if (c == null) return "—";
  if (c >= 0.85) return "High";
  if (c >= 0.65) return "Medium";
  return "Low";
}

function fmtValue(field: string, value: unknown): string {
  if (value == null) return "—";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (field === "assessed_value" || field === "last_sale_price") {
    const n = Number(raw);
    if (Number.isFinite(n)) return `$${Math.round(n).toLocaleString()}`;
  }
  if (field === "living_sqft" || field === "lot_sqft") {
    const n = Number(raw);
    if (Number.isFinite(n)) return `${Math.round(n).toLocaleString()} sf`;
  }
  return raw.length > 40 ? raw.slice(0, 40) + "…" : raw;
}

export function WhyThisScorePanel({ parcelId }: { parcelId: string }) {
  const fetchProv = useServerFn(getFieldProvenance);
  const q = useQuery({
    queryKey: ["prov", parcelId],
    queryFn: () => fetchProv({ data: { parcel_id: parcelId } }),
  });
  const [openField, setOpenField] = useState<string | null>(null);

  if (q.isLoading) {
    return <div className="text-[11px] text-muted-foreground">Loading provenance…</div>;
  }
  if (q.error) {
    return <div className="text-[11px] text-destructive">Provenance unavailable.</div>;
  }
  const d = q.data!;
  const byField = new Map(d.fields.map((f: any) => [f.field_name, f]));
  const conf = d.score_confidence == null ? null : Number(d.score_confidence);

  return (
    <section className="rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Why this score</div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            Every input that fed the underwrite, with its source and confidence.
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Confidence</div>
          <div className="flex items-center justify-end gap-2 text-[13px] font-semibold text-foreground">
            {conf != null && <span className={`inline-block h-2.5 w-2.5 rounded-full ${confidenceColor(conf)}`} />}
            {conf != null ? conf.toFixed(2) : "—"}
            <span className="text-[11px] font-normal text-muted-foreground">({confidenceBand(conf)})</span>
          </div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border/60">
        {DRIVER_ORDER.filter((f) => byField.has(f)).map((f) => {
          const row = byField.get(f)!;
          const c = Number(row.confidence);
          const isOpen = openField === f;
          const hist = d.history[f] ?? [];
          return (
            <div key={f} className="py-2">
              <button
                onClick={() => setOpenField(isOpen ? null : f)}
                className="flex w-full items-center gap-3 text-left text-[12px] hover:bg-surface-2/40"
              >
                {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span className="w-32 shrink-0 text-muted-foreground">{FIELD_LABEL[f] ?? f}</span>
                <span className="w-28 shrink-0 font-medium text-foreground">{fmtValue(f, row.value)}</span>
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${confidenceColor(c)}`} />
                <span className="w-10 shrink-0 num text-muted-foreground">{c.toFixed(2)}</span>
                <span className="w-40 shrink-0 truncate text-muted-foreground">{row.source}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {row.observed_at ? new Date(row.observed_at).toISOString().slice(0, 10) : "—"}
                </span>
              </button>
              {isOpen && hist.length > 1 && (
                <div className="mt-2 ml-6 space-y-1 rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
                  {hist.map((h: any, i: number) => (
                    <div key={i} className="flex gap-2">
                      <span className="w-24 truncate">{h.source}</span>
                      <span className="w-16 num">{Number(h.confidence).toFixed(2)}</span>
                      <span className="w-24">{h.observed_at ? new Date(h.observed_at).toISOString().slice(0, 10) : "—"}</span>
                      <span className="truncate">{fmtValue(f, h.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {d.fields.length === 0 && (
          <div className="py-3 text-[12px] text-muted-foreground">
            No per-field provenance yet — this parcel was scored before provenance tracking was enabled, or its inputs came from a legacy source.
          </div>
        )}
      </div>
    </section>
  );
}
