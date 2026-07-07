/**
 * Repeating-container detector for the "Discover schema" wizard.
 *
 * Given raw HTML, we walk every element that has ≥ MIN_SIBLINGS children
 * sharing the same tag + class signature — that's what a list of foreclosure
 * rows, probate cases, or auction lots looks like structurally. We rank the
 * candidates by (a) sibling count, (b) how much text lives inside a typical
 * row, and (c) presence of dates/dollars/links (strong signals it's a
 * distress / sale roll).
 *
 * For the winning selector we sample the first row's descendants, propose a
 * flat field list (label + selector + type + sample value), and let the user
 * approve / rename / trim in the UI.
 */

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

const MIN_SIBLINGS = 4;

export interface CandidateSchema {
  container_selector: string;
  sample_count: number;
  score: number;
  fields: DiscoveredField[];
  sample_row_text: string;
}

export interface DiscoveredField {
  name: string;
  selector: string;            // CSS selector RELATIVE to the container
  type: "text" | "date" | "money" | "url" | "number";
  sample: string;
}

function classSig(el: any): string {
  const cls = (el.attribs?.class ?? "").split(/\s+/).filter(Boolean).sort().join(".");
  return `${el.name}${cls ? "." + cls : ""}`;
}

function cssEscape(s: string) {
  return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function selectorFor(sig: string): string {
  const [tag, ...cls] = sig.split(".");
  return cls.length ? `${tag}.${cls.map(cssEscape).join(".")}` : tag;
}

function scoreRow(text: string, links: number): number {
  let s = 0;
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) s += 3;   // date
  if (/\$\s?[\d,]+/.test(text)) s += 3;                     // money
  if (/\b\d{5}(-\d{4})?\b/.test(text)) s += 1;              // zip
  if (links > 0) s += 1;
  if (text.length > 40 && text.length < 800) s += 2;
  return s;
}

const DATE_RE = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b/;
const MONEY_RE = /\$\s?[\d,]+(?:\.\d{2})?/;
const NUM_RE   = /^\s*\d+(?:,\d{3})*(?:\.\d+)?\s*$/;

function classify(text: string): DiscoveredField["type"] {
  if (DATE_RE.test(text)) return "date";
  if (MONEY_RE.test(text)) return "money";
  if (NUM_RE.test(text.trim())) return "number";
  return "text";
}

function normalizeName(raw: string, fallback: string): string {
  const cleaned = raw.trim().toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40);
  return cleaned || fallback;
}

function discoverFields($: CheerioAPI, container: any, containerSel: string): DiscoveredField[] {
  const fields: DiscoveredField[] = [];
  const seen = new Set<string>();

  // Strategy 1: <td> cells inside a table row → use nth-child positional selectors
  if (container.name === "tr") {
    // Look for the parent table's header row for column names.
    const table = $(container).closest("table");
    const headers = table.find("thead th, tr:first-child th, tr:first-child td")
      .slice(0, 20).map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get();
    $(container).children("td, th").each((idx, td) => {
      if (fields.length >= 15) return;
      const text = $(td).text().replace(/\s+/g, " ").trim();
      const link = $(td).find("a[href]").attr("href");
      const label = headers[idx] || `col_${idx + 1}`;
      const name = normalizeName(label, `col_${idx + 1}`);
      if (seen.has(name)) return;
      seen.add(name);
      if (link) {
        fields.push({ name: `${name}_url`, selector: `td:nth-child(${idx + 1}) a`, type: "url", sample: new URL(link, "http://x").pathname });
      }
      if (text) {
        fields.push({ name, selector: `td:nth-child(${idx + 1})`, type: classify(text), sample: text.slice(0, 120) });
      }
    });
    return fields;
  }

  // Strategy 2: descendants with a stable class name — one field each.
  const descendants = $(container).find("*").toArray();
  for (const el of descendants) {
    if (fields.length >= 15) break;
    const cls = (el.attribs?.class ?? "").split(/\s+/).filter(Boolean)[0];
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length > 300) continue;
    // Only leaf-ish nodes (avoid huge wrappers).
    if ($(el).children().length > 3) continue;
    const label = cls || el.name;
    const name = normalizeName(label, el.name);
    if (seen.has(name)) continue;
    seen.add(name);
    const sel = cls ? `.${cssEscape(cls)}` : el.name;
    const href = $(el).is("a") ? $(el).attr("href") : $(el).find("a[href]").attr("href");
    if (href) {
      fields.push({ name: `${name}_url`, selector: cls ? `.${cssEscape(cls)} a[href], a[href].${cssEscape(cls)}` : "a[href]", type: "url", sample: href.slice(0, 120) });
    }
    fields.push({ name, selector: sel, type: classify(text), sample: text.slice(0, 120) });
  }
  return fields;
}

export function discoverCandidates(html: string): CandidateSchema[] {
  if (!html || html.length < 100) return [];
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,header,footer,nav").remove();

  const groups = new Map<string, any[]>();  // selector → sibling elements
  $("*").each((_, el: any) => {
    const parent = el.parent;
    if (!parent || parent.type !== "tag") return;
    const sig = classSig(el);
    const siblings = (parent.children || []).filter((c: any) => c.type === "tag" && classSig(c) === sig);
    if (siblings.length < MIN_SIBLINGS) return;
    const parentSig = classSig(parent);
    const key = `${parentSig} > ${sig}`;
    if (!groups.has(key)) groups.set(key, siblings);
  });

  const candidates: CandidateSchema[] = [];
  for (const [key, siblings] of groups) {
    const [parentSig, childSig] = key.split(" > ");
    const parentSel = selectorFor(parentSig);
    const childSel = selectorFor(childSig);
    // Only use the parent scope if it disambiguates (has a class).
    const container_selector = parentSig.includes(".") ? `${parentSel} > ${childSel}` : childSel;

    const first = siblings[0];
    const rowText = $(first).text().replace(/\s+/g, " ").trim().slice(0, 400);
    const links = $(first).find("a[href]").length;
    const rowScore = scoreRow(rowText, links);
    const fields = discoverFields($, first, container_selector);

    const fieldScore = fields.reduce((a, f) => a + (f.type === "money" || f.type === "date" ? 2 : f.type === "url" ? 1 : 0.3), 0);
    const score = Math.min(siblings.length, 200) * 0.5 + rowScore + fieldScore;

    candidates.push({
      container_selector,
      sample_count: siblings.length,
      score: Math.round(score * 10) / 10,
      fields,
      sample_row_text: rowText,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 6);
}

// ---- Runtime extraction: apply a saved recipe to fresh HTML ----

export interface RecipeField {
  name: string;
  selector: string;
  type: "text" | "date" | "money" | "url" | "number";
}

export interface RecipeSpec {
  container_selector: string;
  fields: RecipeField[];
  base_url: string;
}

function coerce(text: string, type: RecipeField["type"], baseUrl: string, href?: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (type === "url") {
    const target = href ?? t;
    if (!target) return null;
    try { return new URL(target, baseUrl).toString(); } catch { return target; }
  }
  if (type === "money") {
    const m = t.match(/[\d,]+(?:\.\d{2})?/);
    return m ? Number(m[0].replace(/,/g, "")) : null;
  }
  if (type === "number") {
    const m = t.match(/-?\d[\d,]*(?:\.\d+)?/);
    return m ? Number(m[0].replace(/,/g, "")) : null;
  }
  if (type === "date") {
    const d = new Date(t);
    return isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
  }
  return t;
}

export function applyRecipe(html: string, spec: RecipeSpec): Record<string, any>[] {
  const $ = cheerio.load(html);
  const rows: Record<string, any>[] = [];
  $(spec.container_selector).each((_, container) => {
    const row: Record<string, any> = {};
    for (const f of spec.fields) {
      const el = $(container).find(f.selector).first();
      if (!el.length) { row[f.name] = null; continue; }
      const href = el.is("a") ? el.attr("href") : el.find("a").attr("href");
      row[f.name] = coerce(el.text(), f.type, spec.base_url, href);
    }
    if (Object.values(row).some((v) => v !== null && v !== "")) rows.push(row);
  });
  return rows;
}
