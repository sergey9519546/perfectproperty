/**
 * Bulk lookup panel: paste rows as "address, state[, city]" (one per line)
 * or "address | state | city", enqueue as a job, watch progress.
 */
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createBulkLookupJob, listBulkLookupJobs, resumeFailedInJob, getBulkLookupJob } from "@/lib/bulk-lookup.functions";


type ParsedRow = { address: string; state: string; city?: string };

function parseRows(text: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/\||,/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) { errors.push(`Line ${i + 1}: need at least "address, state"`); continue; }
    const address = parts[0];
    const state = parts[1];
    const city = parts[2];
    if (state.length !== 2) { errors.push(`Line ${i + 1}: state must be 2 letters (got "${state}")`); continue; }
    rows.push({ address, state: state.toUpperCase(), city: city || undefined });
  }
  return { rows, errors };
}

export function BulkLookupPanel() {
  const create = useServerFn(createBulkLookupJob);
  const list = useServerFn(listBulkLookupJobs);
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ["bulk-lookup-jobs"],
    queryFn: () => list(),
    refetchInterval: 5000,
  });

  const parsed = parseRows(text);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!parsed.rows.length) { setMsg("No valid rows to enqueue."); return; }
    setBusy(true);
    try {
      const r = await create({ data: { name: name.trim() || undefined, rows: parsed.rows } });
      setMsg(`Enqueued ${r.enqueued} addresses. The overnight worker will underwrite them.`);
      setText(""); setName("");
      await qc.invalidateQueries({ queryKey: ["bulk-lookup-jobs"] });
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to enqueue.");
    } finally {
      setBusy(false);
    }
  }

  const resume = useServerFn(resumeFailedInJob);
  const latestJob = jobs.data?.[0] as any;
  const latestFailed = Number(latestJob?.failed ?? 0);
  const [resuming, setResuming] = useState(false);

  async function resumeLatest() {
    if (!latestJob) return;
    setResuming(true); setMsg(null);
    try {
      const r = await resume({ data: { job_id: latestJob.id } });
      setMsg(`Requeued ${r.reset} failed items · ran ${r.processed} now (${r.succeeded} ok, ${r.failed} fail).`);
      await qc.invalidateQueries({ queryKey: ["bulk-lookup-jobs"] });
    } catch (e: any) {
      setMsg(e?.message ?? "Resume failed.");
    } finally {
      setResuming(false);
    }
  }


  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bulk address import</div>
          <div className="mt-0.5 text-[13px] text-foreground">
            Paste one address per line. Format: <code className="rounded bg-surface-2 px-1">address, state[, city]</code>.
            The overnight worker underwrites them via Realie.
          </div>
        </div>
        <button
          type="button"
          onClick={resumeLatest}
          disabled={resuming || !latestJob || latestFailed === 0}
          title={!latestJob ? "No jobs yet" : latestFailed === 0 ? "Latest job has no failed items" : `Requeue ${latestFailed} failed`}
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12px] hover:bg-surface disabled:opacity-40"
        >
          {resuming ? "Resuming…" : `Resume failed (${latestFailed})`}
        </button>
      </div>

      <form onSubmit={submit} className="mt-3 grid gap-2 md:grid-cols-[1fr_240px]">
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"123 Main St, TX, Austin\n456 Oak Ave, TX, Dallas\n789 Elm Dr | CA | San Diego"}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px] font-mono outline-none focus:border-foreground"
          />
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>{parsed.rows.length} valid</span>
            {parsed.errors.length > 0 && <span className="text-skeptic">{parsed.errors.length} invalid</span>}
            {parsed.errors.slice(0, 2).map((e, i) => <span key={i} className="text-skeptic">· {e}</span>)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Job name (optional)"
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-foreground"
          />
          <button
            type="submit"
            disabled={busy || !parsed.rows.length}
            className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12px] hover:bg-surface disabled:opacity-50"
          >
            {busy ? "Enqueuing…" : `Enqueue ${parsed.rows.length} for overnight`}
          </button>
          {msg && <div className="text-[11px] text-muted-foreground">{msg}</div>}
        </div>
      </form>

      {(jobs.data?.length ?? 0) > 0 && (
        <div className="mt-4 overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Job</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Progress</th>
                <th className="px-3 py-2 text-right">OK / Fail</th>
                <th className="px-3 py-2 text-right">Created</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {(jobs.data ?? []).map((j: any) => (
                <JobRow key={j.id} job={j} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: any }) {
  const [open, setOpen] = useState(false);
  const get = useServerFn(getBulkLookupJob);
  const detail = useQuery({
    queryKey: ["bulk-lookup-job", job.id],
    queryFn: () => get({ data: { job_id: job.id } }),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const failedItems = ((detail.data?.items ?? []) as any[]).filter((i) => i.status === "failed");
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-3 py-2">{job.name || job.id.slice(0, 8)}</td>
        <td className="px-3 py-2">{job.status}</td>
        <td className="num px-3 py-2 text-right">{job.processed} / {job.total}</td>
        <td className="num px-3 py-2 text-right">
          <span className="text-profit-strong">{job.succeeded}</span>{" · "}
          <span className="text-skeptic">{job.failed}</span>
        </td>
        <td className="px-3 py-2 text-right text-muted-foreground">
          {new Date(job.created_at).toLocaleString()}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            {open ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-surface-2">
          <td colSpan={6} className="px-3 py-2">
            {detail.isLoading ? (
              <div className="text-[11px] text-muted-foreground">Loading…</div>
            ) : failedItems.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">
                No failed items ({(detail.data?.items ?? []).length} total).
              </div>
            ) : (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {failedItems.length} failed
                </div>
                <table className="mt-1 w-full text-[11px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Address</th>
                      <th className="px-2 py-1 text-left">State</th>
                      <th className="px-2 py-1 text-right">Attempts</th>
                      <th className="px-2 py-1 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedItems.slice(0, 100).map((it: any) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-2 py-1">{it.address}{it.city ? `, ${it.city}` : ""}</td>
                        <td className="px-2 py-1">{it.state}</td>
                        <td className="num px-2 py-1 text-right">
                          {it.attempts ?? 0}/{it.max_attempts ?? 3}
                        </td>
                        <td className="px-2 py-1 text-skeptic">{it.error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {failedItems.length > 100 && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Showing 100 of {failedItems.length} failed items.
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

