/**
 * Zyte integration — server-only.
 *
 * Two capabilities:
 *   1. Zyte API extraction (api.zyte.com/v1/extract) as a fallback fetcher
 *      when a county source is geoblocked / anti-bot'd / 4xx. This is what
 *      lets the engine keep working when a portal wall goes up.
 *   2. Scrapy Cloud job control (app.zyte.com/api) — schedule spiders,
 *      list recent jobs — surfaced on /admin/health.
 *
 * Auth: HTTP Basic with ZYTE_API_KEY as the username, empty password.
 * Never import at module scope of a *.functions.ts file — server-only.
 */

const ZYTE_EXTRACT_URL = "https://api.zyte.com/v1/extract";
const SCRAPY_CLOUD_URL = "https://app.zyte.com/api";

function authHeader(): string {
  const key = process.env.ZYTE_API_KEY;
  if (!key) throw new Error("ZYTE_API_KEY not configured");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export function zyteProjectId(): string {
  return process.env.ZYTE_PROJECT_ID ?? "870105";
}

export function zyteEnabled(): boolean {
  return !!process.env.ZYTE_API_KEY;
}

/**
 * Fetch a URL through Zyte's extraction API. Returns decoded body text.
 * `browser: true` uses a real headless browser (SPAs, JS-gated GIS portals).
 */
export async function zyteFetch(
  url: string,
  opts: { browser?: boolean; timeoutMs?: number; geolocation?: string } = {},
): Promise<{ ok: boolean; status: number; body: string; note: string }> {
  if (!zyteEnabled()) return { ok: false, status: 0, body: "", note: "ZYTE_API_KEY missing" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  const body: Record<string, unknown> = { url };
  if (opts.browser) body.browserHtml = true;
  else body.httpResponseBody = true;
  if (opts.geolocation) body.geolocation = opts.geolocation;
  try {
    const res = await fetch(ZYTE_EXTRACT_URL, {
      method: "POST",
      headers: {
        authorization: authHeader(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { ok: false, status: res.status, body: "", note: j?.detail ?? j?.title ?? `HTTP ${res.status}` };
    }
    const html = opts.browser
      ? String(j.browserHtml ?? "")
      : Buffer.from(String(j.httpResponseBody ?? ""), "base64").toString("utf8");
    const upstream = Number(j.statusCode ?? 200);
    return {
      ok: upstream >= 200 && upstream < 400,
      status: upstream,
      body: html,
      note: `zyte upstream ${upstream}`,
    };
  } catch (e: any) {
    return { ok: false, status: 0, body: "", note: String(e?.message ?? e).slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Same-shape wrapper as global `fetch` (only the parts adapters use).
 * Adapters call `zyteFetchLike(url)` when their direct call fails.
 */
export async function zyteFetchLike(url: string, opts: { browser?: boolean } = {}) {
  const r = await zyteFetch(url, opts);
  return {
    ok: r.ok,
    status: r.status,
    text: async () => r.body,
    json: async () => {
      try { return JSON.parse(r.body); } catch { throw new Error(`zyte body not JSON: ${r.body.slice(0, 200)}`); }
    },
    _note: r.note,
  };
}

// ---------- Scrapy Cloud ----------

export interface ScrapyJob {
  id: string;
  spider: string;
  state: string;               // pending | running | finished
  close_reason?: string;
  started_time?: string;
  finished_time?: string;
  items_scraped: number;
  errors_count: number;
  tags: string[];
}

export async function scrapyCloudListJobs(count = 20): Promise<ScrapyJob[]> {
  if (!zyteEnabled()) return [];
  const url = `${SCRAPY_CLOUD_URL}/jobs/list.json?project=${zyteProjectId()}&count=${count}`;
  const res = await fetch(url, { headers: { authorization: authHeader() } });
  if (!res.ok) throw new Error(`Scrapy Cloud list ${res.status}: ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as any;
  const jobs = Array.isArray(j?.jobs) ? j.jobs : [];
  return jobs.map((x: any) => ({
    id: String(x.id ?? ""),
    spider: String(x.spider ?? ""),
    state: String(x.state ?? ""),
    close_reason: x.close_reason,
    started_time: x.started_time,
    finished_time: x.finished_time,
    items_scraped: Number(x.items_scraped ?? 0),
    errors_count: Number(x.errors_count ?? 0),
    tags: Array.isArray(x.tags) ? x.tags : [],
  }));
}

export async function scrapyCloudSchedule(args: {
  spider: string;
  recipe?: string;
  jobArgs?: Record<string, string>;
}): Promise<{ jobid: string }> {
  if (!zyteEnabled()) throw new Error("ZYTE_API_KEY missing");
  const params = new URLSearchParams({
    project: zyteProjectId(),
    spider: args.spider,
  });
  if (args.recipe) params.append("job_settings", JSON.stringify({ LOVABLE_RECIPE: args.recipe }));
  for (const [k, v] of Object.entries(args.jobArgs ?? {})) params.append(k, v);

  const res = await fetch(`${SCRAPY_CLOUD_URL}/run.json`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || j.status === "error") {
    throw new Error(`Scrapy Cloud schedule: ${j.message ?? res.status}`);
  }
  return { jobid: String(j.jobid ?? "") };
}
