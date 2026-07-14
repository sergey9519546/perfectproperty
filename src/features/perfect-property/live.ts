import type { RankedParcelRow } from './live-types'
import { fmt$, ringLabel, tierLabel } from '@/lib/format'

export type LiveLayerMode = 'Opportunity score' | 'Expected profit' | 'Loss risk' | 'Deal odds'
export type LiveRegionFilter = 'All regions' | 'California' | 'Florida'

export type WorkspaceParcel = {
  id: string
  address: string
  city: string
  state: string
  zip: string | null
  coordinates: [number, number]
  score: number
  ring: number
  ringLabel: string
  profit: number
  offer: number
  lossRisk: number
  dealOdds: number
  exitDays: number
  scope: string
  countyFips: string | null
  computedAt: string | null
  livingSqft: number | null
  yearBuilt: number | null
  bedrooms: number | null
  bathrooms: number | null
  absentee: boolean
  isListed: boolean
  confidenceGrade: string | null
  marketLabel: string
}

/** Normalize listRankedParcels row → workspace parcel. */
export function toWorkspaceParcel(row: RankedParcelRow): WorkspaceParcel | null {
  const p = row.parcels
  if (!p?.id) return null
  const lat = Number(p.lat)
  const lng = Number(p.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const score = Number(row.perfect_score ?? 0)
  const profit = Number(row.gross_profit ?? row.risk_adjusted_profit ?? 0)
  const offer = Number(row.modeled_offer ?? 0)
  const lossRisk = Number(row.mc_p_loss ?? 0)
  const dealOdds = Number(row.acquisition_probability ?? 0)
  const exitDays = Number(row.exit_days ?? 0)
  const ring = Number(row.ring ?? 1)
  const city = p.city ?? 'Unknown'
  const state = p.state ?? ''
  return {
    id: row.parcel_id,
    address: p.address ?? 'Unknown address',
    city,
    state,
    zip: p.zip ?? null,
    coordinates: [lng, lat],
    score,
    ring,
    ringLabel: ringLabel(ring),
    profit,
    offer,
    lossRisk,
    dealOdds,
    exitDays,
    scope: row.recommended_scope ?? '—',
    countyFips: p.county_fips ?? null,
    computedAt: row.computed_at ?? null,
    livingSqft: p.living_sqft ?? null,
    yearBuilt: p.year_built ?? null,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    absentee: Boolean(p.owner_is_absentee),
    isListed: Boolean(p.is_listed),
    confidenceGrade: row.confidence_grade ?? null,
    marketLabel: [city, state].filter(Boolean).join(', '),
  }
}

export function layerMetric(parcel: WorkspaceParcel, layer: LiveLayerMode): number {
  if (layer === 'Expected profit') {
    // Normalize profit into a 0–100 display scale for map color ramps
    const scaled = 50 + (parcel.profit / 50_000) * 25
    return Math.max(0, Math.min(100, scaled))
  }
  if (layer === 'Loss risk') return Math.max(0, Math.min(100, parcel.lossRisk * 100))
  if (layer === 'Deal odds') return Math.max(0, Math.min(100, parcel.dealOdds * 100))
  return Math.max(0, Math.min(100, parcel.score))
}

export function filterParcels(
  parcels: WorkspaceParcel[],
  region: LiveRegionFilter,
): WorkspaceParcel[] {
  if (region === 'All regions') return parcels
  const want = region === 'California' ? 'CA' : 'FL'
  return parcels.filter((p) => p.state.toUpperCase() === want)
}

export function coverageFromParcels(parcels: WorkspaceParcel[]): string {
  const states = new Set(parcels.map((p) => p.state).filter(Boolean))
  if (states.size === 0) return '—'
  return [...states].sort().join(' + ')
}

export function snapshotFromParcels(parcels: WorkspaceParcel[]): string | null {
  let latest: string | null = null
  for (const p of parcels) {
    if (!p.computedAt) continue
    if (!latest || p.computedAt > latest) latest = p.computedAt
  }
  return latest
}

export function formatMoney(n: number): string {
  return fmt$(n)
}

export function parcelTier(score: number) {
  return tierLabel(score)
}

export function underwriteGuidance(score: number, ring: number): string {
  const tier = tierLabel(score).label
  const source = ringLabel(ring)
  if (score >= 80) {
    return `${tier} · ${source}. Prioritize inspection, title, and offer execution. Modeled economics clear the buy bar.`
  }
  if (score >= 65) {
    return `${tier} · ${source}. Validate reno scope and exit timing before committing capital.`
  }
  if (score >= 50) {
    return `${tier} · ${source}. Run stress cases on offer and carry; only advance with a clear edge.`
  }
  return `${tier} · ${source}. Below the current buy bar — watch for trigger or price movement.`
}