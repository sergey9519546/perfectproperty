import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { probeUrl, listProbes } from "@/lib/probe.functions";
import { MagnifyingGlass, MagicWand } from "@phosphor-icons/react";
import { toast } from "sonner";

type ProbeTier = "auto" | "plain" | "zyte" | "browser";

interface ProbeResult {
  status: string;
  tier: string;
  http_status: number;
  bytes: number;
  duration_ms: number;
  title?: string;
  final_url: string;
  text_preview?: string;
  hints?: {
    headings?: string[];
    dates?: string[];
    dollars?: string[];
    tables?: number;
    forms?: number;
    links?: { href: string; text: string }[];
  };
}

function statusColor(status: string): string {
  if (status === "OK" || status === "CACHED") return "var(--profit-strong)";
  if (status === "BLOCKED") return "var(--opportunity)";
  return "var(--skeptic)";
}

/**
 * Self-contained URL probe tool. Owns its own server-function hooks, state,
 * and queries. Calls `onDiscoverUrl` when the user clicks "Discover schema"
 * so the parent RecipeManager can pick it up.
 */
export function ProbePanel({ onDiscoverUrl }: { onDiscoverUrl: (url: string) => void }) {
  const probeFn = useServerFn(probeUrl);
  const probesFn = useServerFn(listProbes);
  const qc = useQueryClient();
  const probes = useQuery({ queryKey: ["probes"], queryFn: () => probesFn() });
  const [input, setInput] = useState("");
  const [tier, setTier] = useState<ProbeTier>("auto");
  const [result, setResult] = useState<ProbeResult | null>(null);

  const probe = useMutation({
    mutationFn: (v: { url: string; tier: ProbeTier }) =>
      probeFn({ data: { url: v.url, tier: v.tier, force: false, ttl_hours: 24 } }),
    onSuccess: (r: ProbeResult) => {
      setResult(r);
      toast.success(`Probe ${r.status} · ${r.tier} · ${(r.bytes / 1024).toFixed(1)}KB`);
      qc.invalidateQueries({ queryKey: ["probes"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Probe failed"),
  });

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Live URL probe · tiered fetcher</h2>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Zyte key:{" "}
          <span className={probes.data?.zyte_key_present ? "text-profit-strong" : "text-skeptic"}>
            {probes.data?.zyte_key_present ? "present" : "missing"}
          </span>
          {" · "}Cached URLs: <span className="text-foreground">{probes.data?.cached ?? 0}</span>
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://recorder.county.gov/foreclosure-calendar"
            className="flex-1 min-w-[280px] rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as ProbeTier)}
            className="rounded-md border border-border bg-background px-2 py-2 text-[12px]"
          >
            <option value="auto">auto (plain to zyte to browser)</option>
            <option value="plain">plain fetch (free)</option>
            <option value="zyte">zyte http (rotating proxy)</option>
            <option value="browser">zyte browser (JS render)</option>
          </select>
          <button
            onClick={() => input && probe.mutate({ url: input, tier })}
            disabled={!input || probe.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          >
            <MagnifyingGlass className="h-4 w-4" />
            {probe.isPending ? "Fetching…" : "Probe URL"}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Plain = free direct fetch (~40% of county HTML). Zyte = anti-bot proxy (~$0.0002/req,
          needs <code>ZYTE_API_KEY</code>). Browser = JS render (~5x cost). Results cached 24h.
        </div>

        {result && (
          <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest"
                style={{
                  color: statusColor(result.status),
                  backgroundColor: `color-mix(in oklab, ${statusColor(result.status)} 15%, transparent)`,
                }}
              >
                {result.status}
              </span>
              <span className="text-muted-foreground">
                tier: <span className="text-foreground">{result.tier}</span>
              </span>
              <span className="text-muted-foreground">
                HTTP: <span className="text-foreground">{result.http_status}</span>
              </span>
              <span className="text-muted-foreground">{(result.bytes / 1024).toFixed(1)} KB</span>
              <span className="text-muted-foreground">{result.duration_ms} ms</span>
              <button
                onClick={() => onDiscoverUrl(input || result.final_url)}
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-opportunity px-2 py-1 text-[11px] font-medium text-black transition-opacity hover:opacity-90"
              >
                <MagicWand className="h-3 w-3" />
                Discover schema
              </button>
            </div>
            {result.title && <div className="mt-2 font-medium">{result.title}</div>}
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{result.final_url}</div>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Headings</div>
                <ul className="mt-1 space-y-0.5">
                  {(result.hints?.headings ?? []).slice(0, 8).map((h, i) => (
                    <li key={i} className="truncate text-[11px]">{h}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Dates / Currency</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(result.hints?.dates ?? []).map((d, i) => (
                    <span key={"d" + i} className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono">{d}</span>
                  ))}
                  {(result.hints?.dollars ?? []).map((d, i) => (
                    <span key={"s" + i} className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono text-profit">{d}</span>
                  ))}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">Structure</div>
                <div className="text-[11px] text-muted-foreground">
                  Tables: {result.hints?.tables ?? 0} · Forms: {result.hints?.forms ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Links (first 8)</div>
                <ul className="mt-1 space-y-0.5">
                  {(result.hints?.links ?? []).slice(0, 8).map((l, i) => (
                    <li key={i} className="truncate text-[11px]">
                      <a href={l.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {l.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                Text preview (first 4KB)
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px]">
                {result.text_preview}
              </pre>
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
                  <span className="w-16" style={{ color: statusColor(r.status) }}>{r.status}</span>
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
  );
}
