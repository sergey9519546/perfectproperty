/**
 * Server-only fetch tiers for the live scraper.
 *
 *   plain   → raw fetch(). Free, fast, works for ~40% of county HTML.
 *   zyte    → Zyte API (httpResponseBody). Rotating proxies + anti-bot.
 *             Handles ASP.NET recorders and most county sites.
 *             Requires ZYTE_API_KEY.
 *   browser → Zyte API with browserHtml=true. Full JS render. ~5× cost.
 *
 * "auto" tries plain first; on 403/429/5xx or empty body it upgrades to
 * zyte (if key present) and finally browser.
 */

import * as cheerio from "cheerio";

export type Tier = "plain" | "zyte" | "browser";

export interface ProbeResult {
  tier: Tier;
  http_status: number;
  final_url: string;
  content_type: string;
  bytes: number;
  title: string | null;
  text: string;
  html: string;
  status: "OK" | "BLOCKED" | "FAIL";
  note: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function extract(html: string, contentType: string) {
  if (!contentType.includes("html")) {
    return { title: null, text: html.slice(0, 4000) };
  }
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();
  const title = $("title").first().text().trim() || null;
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, text };
}

function isBlocked(status: number, body: string) {
  if (status === 403 || status === 429 || status === 503) return true;
  const low = body.slice(0, 4000).toLowerCase();
  return (
    low.includes("access denied") ||
    low.includes("just a moment") ||       // Cloudflare challenge
    low.includes("attention required") ||  // Cloudflare
    low.includes("captcha") ||
    low.includes("perimeterx") ||
    low.includes("distil")
  );
}

async function fetchPlain(url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const ct = res.headers.get("content-type") ?? "text/html";
    const { title, text } = extract(html, ct);
    const blocked = isBlocked(res.status, html);
    return {
      tier: "plain",
      http_status: res.status,
      final_url: res.url,
      content_type: ct,
      bytes: html.length,
      title,
      text,
      html,
      status: blocked ? "BLOCKED" : res.ok ? "OK" : "FAIL",
      note: `plain ${res.status} in ${Date.now() - started}ms`,
    };
  } catch (e: any) {
    return {
      tier: "plain", http_status: 0, final_url: url, content_type: "",
      bytes: 0, title: null, text: "", html: "",
      status: "FAIL", note: `plain fetch error: ${e.message}`,
    };
  }
}

async function fetchZyte(url: string, browser: boolean): Promise<ProbeResult> {
  const key = process.env.ZYTE_API_KEY;
  if (!key) {
    return {
      tier: browser ? "browser" : "zyte", http_status: 0, final_url: url,
      content_type: "", bytes: 0, title: null, text: "", html: "",
      status: "FAIL",
      note: "ZYTE_API_KEY not set — add the secret to enable the Zyte fetch tier.",
    };
  }
  const started = Date.now();
  const body: any = { url };
  if (browser) { body.browserHtml = true; }
  else { body.httpResponseBody = true; }
  try {
    const res = await fetch("https://api.zyte.com/v1/extract", {
      method: "POST",
      headers: {
        authorization: "Basic " + btoa(`${key}:`),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return {
        tier: browser ? "browser" : "zyte",
        http_status: res.status, final_url: url,
        content_type: "", bytes: 0, title: null, text: "", html: "",
        status: "FAIL",
        note: `zyte ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }
    const json = await res.json() as any;
    let html = "";
    if (browser) html = json.browserHtml ?? "";
    else if (json.httpResponseBody) html = atob(json.httpResponseBody);
    const upstream = json.statusCode ?? 200;
    const ct = "text/html";
    const { title, text } = extract(html, ct);
    return {
      tier: browser ? "browser" : "zyte",
      http_status: upstream,
      final_url: json.url ?? url,
      content_type: ct,
      bytes: html.length,
      title, text, html,
      status: upstream >= 200 && upstream < 400 ? "OK" : "BLOCKED",
      note: `zyte ${browser ? "browser" : "http"} ${upstream} in ${Date.now() - started}ms`,
    };
  } catch (e: any) {
    return {
      tier: browser ? "browser" : "zyte", http_status: 0, final_url: url,
      content_type: "", bytes: 0, title: null, text: "", html: "",
      status: "FAIL", note: `zyte error: ${e.message}`,
    };
  }
}

export async function probeFetch(url: string, tier: Tier | "auto"): Promise<ProbeResult> {
  if (tier === "plain") return fetchPlain(url);
  if (tier === "zyte") return fetchZyte(url, false);
  if (tier === "browser") return fetchZyte(url, true);
  // auto: plain → zyte → browser
  const p = await fetchPlain(url);
  if (p.status === "OK" && p.html.length > 200) return p;
  const z = await fetchZyte(url, false);
  if (z.status === "OK" && z.html.length > 200) return z;
  if (z.note.includes("ZYTE_API_KEY not set")) return p;   // no key → return plain result
  const b = await fetchZyte(url, true);
  return b.status === "OK" ? b : (z.html.length > p.html.length ? z : p);
}
