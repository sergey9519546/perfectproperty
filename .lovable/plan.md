## Ultraplan: Bulletproof Ingestion, Security & UI

Scope: 4 phases across ingest, auth, UI resilience, and observability. Ship in one pass.

### Phase 1 — Ingestion hardening
- **Preflight/circuit breaker**: add `src/lib/ingest-preflight.ts` — HEAD/GET ping each `COUNTY_SOURCES[i].parcels.url` with 5s timeout. Failures mark source as `tripped` in an in-memory + DB-persisted breaker (new column on `ingestion_runs` or new `source_health` table). `ingest-all.ts` skips tripped sources and logs.
- **Exponential backoff**: wrap Realie calls (`realieLookupAddress`, `realieLookupParcelId`, `realieComparables`) in a shared `retryWithBackoff(fn, {retries:4, base:500, on429:true})` helper in `src/lib/retry.ts`. On 429/5xx, backoff; on final failure, push to DLQ.
- **Dead Letter Queue**: new `ingestion_failures` table (parcel_ref, source, stage, error, stack, created_at). Insert from every `catch` in ingest/underwrite/score paths. Admin view surfaces recent failures.

### Phase 2 — Security & consistency
- **Auth-gate interceptor**: root `__root.tsx` already invalidates on auth state; add a small `use401Interceptor()` hook that patches `fetch` to detect 401 responses from server fns and route to `/auth` cleanly.
- **Atomic writes**: dossier + prediction + score updates go through a single Postgres function `public.record_underwrite_atomic(...)` (SECURITY INVOKER, transactional). Replace multi-step server-fn writes with one RPC call.

### Phase 3 — Frontend resilience
- **Error boundaries**: new `src/components/SectionBoundary.tsx` — minimalist gray wireframe fallback with "Data unavailable". Wrap `MapView`, deals table, off-market list, prophecy list.
- **Hydration recovery**: set `<Hydrate suppressHydrationWarning>` on volatile timestamp nodes; on mismatch log to `reportLovableError` and let client re-render.

### Phase 4 — Observability
- **Admin health page** `/admin/health`: cards for
  - 24h ingested vs failed (from `ingestion_runs` + `ingestion_failures`)
  - Realie credit-burn proxy: count of Realie calls / hour from `probe_runs`
  - Per-county rings (green/yellow/red) from breaker state
- **Freshness indicator**: `DataFreshness` component reads `parcel_scores.updated_at` or `parcels.last_seen_at`, renders "Underwritten 2h ago" in dossier + list rows.

### Technical details
- New files: `src/lib/retry.ts`, `src/lib/ingest-preflight.ts`, `src/lib/dlq.ts`, `src/components/SectionBoundary.tsx`, `src/components/DataFreshness.tsx`, `src/routes/admin.health.tsx`.
- Migration: create `ingestion_failures` + `source_health` tables with GRANTs + RLS (admin-only via `has_role`), and `record_underwrite_atomic` function.
- Edits: `src/lib/adapters/realie.ts` (wrap calls), `src/lib/ingest-core.ts` (preflight + DLQ), `src/routes/api/public/ingest-all.ts` (skip tripped), `src/routes/index.tsx` + `deals.tsx` + `shadow.tsx` + `prophecy.tsx` (wrap in `SectionBoundary`, add `DataFreshness`).

### Order of execution
1. DB migration (tables + RPC) — needs approval first
2. Retry/DLQ/preflight libs
3. Wire into ingest + underwrite paths
4. Error boundaries + freshness component into pages
5. Admin health route

Confirm and I'll start with the migration.
