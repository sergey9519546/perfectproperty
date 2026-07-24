
# Perfect Property — 90-Day Plan to First Paying Customers

## 1. Executive summary

You've built an ambitious three-layer pipeline (Scrapy discovery → Realie enrichment → underwriting engine) with orchestration, provenance, monitoring, DLQ, and even payments scaffolding. The engineering surface area is impressive, but on the metrics that decide whether fix-and-flippers will pay:

- **The Realie enrichment pipeline is 100% failing.** 900/900 logged calls errored (571× 404, 150× 403, 179× uncaught exceptions). The 321 pending queue entries will not resolve until this is fixed. Every "smart" downstream system depends on this data.
- **Coverage is 3 states, 6 counties, 1,268 parcels, 571 fully-attributed.** That is a demo, not a market. A flipper needs one metro they trust, not six they don't.
- **Zero recent distress events.** The trigger-gated dealflow that the /deals page depends on is running on a fallback, not the real signal.
- **Paddle is enabled but there is no `subscriptions` table, no paywall, no pricing page, and no product catalog.** There is no path from "user lands on site" to "money in bank."
- **2 total users.** Nothing has been tested with a real flipper.

The strongest realistic 90-day version is **not** more sources, more counties, or more surface. It's a **narrow, trustworthy, paywalled underwriting tool for one metro** that a flipper opens every morning. Ship that, charge $99–$199/mo, get 10 paying customers, then expand.

## 2. Reconstructed project

- **What it is:** A fix-and-flip deal-scoring platform. Ingests parcels + distress signals via Scrapy/Zyte, enriches attributes via Realie, underwrites (ARV, offer, profit) with a versioned engine, ranks parcels into rings (listed / off-market / predicted), surfaces them in Deals/Shadow/Prophecy/Monitoring/Accuracy views.
- **Maturity:** Sophisticated MVP-grade infra, sub-MVP product. Backend runs; the value proposition to the buyer is not yet demonstrated end-to-end.
- **Assumed model:** SaaS subscription (Paddle enabled). No pricing, tiers, or gating actually built.

**Confirmed:** 1,268 LIVE parcels (CA, IL, NY), 1,000 scored, 571 fully-attributed, 6 counties, 46 seeded scrape templates, 0 scrape runs executed, 900 Realie calls all failed, 0 recent distress, 2 users, no `subscriptions` table.
**Inferred:** Scrapy Cloud is deployed but spiders haven't produced usable runs into `scrape_runs`; the "trigger" gate falls back to scored parcels because no triggers exist.
**Unverified:** Realie API key validity / plan tier (403s suggest auth or entitlement); why 404s dominate (bad address normalization vs. genuinely-unknown parcels); who your first 10 buyers actually are.

## 3. North Star

**"The morning coffee tool for a fix-and-flip investor in {one metro}."**
Every business day at 6am, the flipper opens Perfect Property and sees 5–20 new scored opportunities in their metro, each with: address, ARV, recommended max offer, expected profit, confidence, and *why* the score exists (provenance). One click contacts the owner or exports to their CRM. Paid.

Quality bar to charge $99–$199/mo:
- ≥95% of surfaced deals have complete attributes (beds/baths/sqft/year built/lot).
- ARV within ±10% of eventual sale on ≥70% of closed comps (measurable via `/accuracy`).
- ≥5 new triggered deals per day in the chosen metro.
- < 2s page load, no broken pages, no visible internal jargon.

## 4. Current-state scorecard

| Area | Now | Target (90d) | Priority |
|---|---|---|---|
| Realie enrichment reliability | 0/10 (100% failure) | 9/10 | **Critical** |
| Coverage in a chosen metro | 3/10 (spread thin) | 8/10 (one metro deep) | **Critical** |
| Distress signal freshness | 1/10 (0 recent) | 8/10 (daily) | **Critical** |
| Monetization (paywall + pricing) | 1/10 (Paddle enabled only) | 8/10 | **Critical** |
| Underwriting accuracy proof | 3/10 (8 outcomes) | 7/10 (100+ backtested) | High |
| UI clarity for non-technical user | 5/10 | 8/10 | High |
| Public trust pages (T&C, refund, privacy) | 0/10 | 10/10 (Paddle requires) | **Critical** |
| Observability / on-call | 6/10 | 8/10 | Medium |
| Multi-metro scale | 2/10 | 3/10 (deferred) | Low |
| MCP/agent tools, prophecy, shadow, prov UI | 6/10 | 6/10 (freeze) | Low |

## 5. Critical weaknesses

1. **Realie broken.** 900/900 failed. Root cause unconfirmed — likely one or more of: expired/wrong key, wrong plan tier (403), county-name mismatch after FIPS lookup (404), unhandled response shape (EXCEPTION). Until fixed, nothing else matters.
2. **No spiders producing runs.** `scrape_runs = 0` despite 46 seeded targets and a deployed Scrapy Cloud project. The whole discovery layer is dark.
3. **No revenue path.** Paddle is turned on; nothing else is built. No `subscriptions` table, no pricing page, no paywall on `/deals`, no product catalog.
4. **Coverage is a mirage.** 6 counties across 3 states is worse than 1 county deep — no flipper works nationally.
5. **Empty policy pages** will block Paddle go-live.
6. **Unfocused surface.** Prophecy, Shadow, Monitoring, Accuracy, Admin, MCP tool all compete for attention when the core "Deals" experience isn't yet trustworthy.

## 6. Recommended strategy — "One Metro, One Buyer, One Bill"

**Pick one metro** (recommend Cook County, IL — you already have parcels there, sizeable flipper population, public foreclosure/probate data). Do nothing outside it for 60 days.

**Fix Realie first**, then fire spiders for that one metro only. Prove the pipeline works end-to-end in one place before expanding. Instrument accuracy with real closed sales in that metro.

**Wire a hard paywall** on `/deals` and `/workspace` with Paddle. $99/mo Starter (1 metro, 100 deals/mo), $199/mo Pro (unlimited deals + exports). Free plan sees 3 sample deals then hits paywall.

**Sell manually to 10 flippers.** Cold outreach in the chosen metro, screen-share demo, close on the call. Don't build growth loops until 10 people pay.

**Freeze everything else.** Prophecy, Shadow, MCP tools, multi-source scoring, provenance UI — leave as-is. Come back after paying customers.

### Strategic options considered

- **Conservative (self-tool):** Keep going as-is, no monetization. Rejected — user picked "revenue."
- **Balanced (recommended):** One metro, paywall, 10 customers.
- **Aggressive (multi-metro launch):** Buy Realie enterprise, fire all spiders, national deals. Rejected — Realie is broken, coverage is worse than one deep metro, and there are no customers yet to justify infra spend.

## 7. Phased plan

### Phase 0 — Diagnose Realie (Week 1, Small)
- Reproduce a failing address end-to-end with verbose logging.
- Verify `REALIE_API_KEY` validity + plan entitlements (403s are auth/tier; 404s often address-normalization).
- Fix FIPS → county-name mapping (a known previous fix; verify it's actually hitting Realie).
- Add explicit handling for 403 (surface as circuit-breaker open, alert admin).
- **Done when:** ≥80% of a 50-parcel test batch returns a valid response.

### Phase 1 — Metro focus (Week 1–2, Small)
- Choose Cook County, IL (or your preference).
- Delete or freeze parcels/targets outside the chosen metro from the default queries (data can stay; UI filters).
- Reset `scrape_targets` for that metro to `pending` and prioritize.
- **Done when:** `/deals` shows only the chosen metro.

### Phase 2 — Fire the discovery pipeline (Week 2–3, Medium)
- Actually run the Scrapy Cloud spiders (foreclosure NOD, probate, code violations) against the chosen metro on a daily schedule.
- Confirm HMAC webhook is receiving payloads (`scrape_runs > 0`).
- Verify each parcel gets a `distress_event` and gets enqueued for Realie.
- **Done when:** ≥50 new distress events land per week in the chosen metro.

### Phase 3 — Accuracy proof (Week 3–4, Medium)
- Backfill closed sales for the last 12 months in the metro.
- Run `backfill-outcomes` for that range.
- Publish honest accuracy numbers on `/accuracy` (ARV median error, WIN rate).
- **Done when:** ≥100 outcomes closed, ARV median error < 15%.

### Phase 4 — Paywall + pricing (Week 3–5, Medium; can run in parallel)
- Create `subscriptions` table + webhook per Paddle template.
- Create products: `starter_monthly` ($99), `pro_monthly` ($199).
- Build `/pricing`, gate `/deals` and `/workspace` behind `useSubscription`.
- Server-side gate the parcels listing (limit 3 deals for free tier).
- Add T&C, Refund Policy (30-day), Privacy Notice — Paddle blocks go-live without them.
- Ask user for legal business/personal name for policy pages.
- **Done when:** A test user can subscribe, be recognized, and unlock full deals.

### Phase 5 — UX polish for a non-technical buyer (Week 5–6, Medium)
- Rewrite `/deals` header: "New deals in {Metro} today" with count.
- Rename internal terms: "Ring 2" → "Off-market", "perfect_score" → "Deal score".
- Deal card shows: Address, ARV, Max offer, Expected profit, Confidence, "Why" (collapsed).
- One primary CTA per card: "Add to my list" (skip trace / export later).
- Hide Prophecy, Shadow, MCP, Monitoring, Accuracy from primary nav (keep under /more).
- **Done when:** A non-technical friend can open the site and describe what it does in one sentence.

### Phase 6 — Manual sales (Week 6–12, Medium)
- Build a 100-flipper prospect list in the metro (Meetup, BiggerPockets, county REIA).
- 15 demo calls / week. Close on the call.
- **Done when:** 10 paying subscribers.

### Phase 7 — Retention loop (Week 8–12, Small)
- Daily 6am email: "N new deals today in {Metro}" with top 5.
- Weekly cohort of accuracy vs. actual sales.
- **Done when:** Day-7 retention ≥70%, day-30 ≥50%.

### Freeze list (do NOT touch until 10 paying customers)
Prophecy, Shadow, MCP agent tools, provenance UI beyond current, multi-metro expansion, warehouse/portfolio analytics, additional AI agents, Zyte enterprise tier, discovery spiders outside the chosen metro.

## 8. Prioritized backlog

| # | Task | Impact | Effort | Priority |
|---|---|---|---|---|
| 1 | Diagnose + fix Realie (403/404/exception) | Critical | S | P0 |
| 2 | Pick metro, restrict default queries to it | Critical | S | P0 |
| 3 | Draft T&C / Refund / Privacy pages | Critical | S | P0 |
| 4 | Fire Scrapy spiders daily in metro | Critical | M | P0 |
| 5 | `subscriptions` table + Paddle webhook | Critical | M | P0 |
| 6 | Products + `/pricing` page | Critical | S | P0 |
| 7 | Server-side paywall on `/deals` and `/workspace` | Critical | S | P0 |
| 8 | Backfill outcomes + honest `/accuracy` | High | M | P1 |
| 9 | Deal-card rewrite for lay buyer | High | M | P1 |
| 10 | Rename internal jargon in UI | High | S | P1 |
| 11 | Hide Prophecy/Shadow/Monitoring from main nav | High | S | P1 |
| 12 | Manual sales: 100-prospect list + 15 demos/wk | Critical | L | P1 |
| 13 | Daily deal email | Medium | M | P2 |
| 14 | Skip-trace / CRM export | Medium | M | P2 |
| 15 | Second metro | Low | L | P3 (deferred) |

## 9. Next 3 actions

1. **Diagnose Realie.** Take one address from a known-failed audit row, run it through `realieLookupAddress` with full logging. Determine whether 403 is auth/tier and whether 404s are address-normalization. Fix or escalate to Realie support. Do not touch anything else until this is green.
2. **Pick the metro and lock the app to it.** Confirm Cook County IL (or your choice). Add a metro filter default so `/deals`, `/workspace`, and enrichment queue only act on it.
3. **Ask you for legal name + confirm metro**, then generate T&C / Refund / Privacy pages (Paddle blocks go-live without these — expected 24h Paddle review after readiness).

## 10. Quality bar (release gates)

- **Data:** ≥95% of surfaced parcels have beds/baths/sqft/year built. ARV median error <15% on backfilled outcomes.
- **Reliability:** Realie success rate ≥90% (audit log). No unhandled exceptions in `/deals` for 7 days.
- **UX:** New user can subscribe and see full deals in <2 min without help. Non-technical friend can describe the app in one sentence.
- **Compliance:** Paddle readiness check passes; T&C/Refund/Privacy live.
- **Commercial:** 10 paying subscribers, ≥70% day-7 retention.

## 11. Validation experiments

- **H1 — Flippers will pay $99+/mo for one-metro triggered deals.** Test: 5 demo calls; count who commits payment info on the call. Fail threshold: <2 of 5. Response: drop price to $49, or pivot channel/ICP.
- **H2 — Realie is fixable within our plan.** Test: 50-parcel diagnostic batch. Fail threshold: <50% success after fixing normalization + auth. Response: switch enrichment source (ATTOM, DataTree) or scrape county assessors directly.
- **H3 — Daily distress volume in one metro is enough.** Test: 2 weeks of Scrapy runs in the metro. Fail threshold: <10 new distress events / week. Response: add MLS ingest for the metro or pick a bigger metro.

## 12. Stop-doing list

- Adding sources, models, tools, or pages before Realie works and someone pays.
- Building for national coverage.
- Investing further in Prophecy/Shadow/MCP surfaces.
- Writing more admin dashboards.
- Any UI change unrelated to the deal-card or paywall.

## 13. Verdict

Strong technical foundation, wrong scope for the stated goal. You've built the plumbing of a national platform but have no working data source, no paying customer, no revenue mechanic, and no metro deep enough for a flipper to trust. The 90-day fix is severe scope collapse: one metro, one buyer profile, one working data pipeline, one paywall. Everything else is a distraction until 10 people pay.
