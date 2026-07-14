export type RegionFilter = 'All markets' | 'California' | 'Florida'
export type PropertyFilter = 'All types' | 'Multifamily' | 'Build-to-rent' | 'Office'
export type LayerMode = 'Opportunity score' | 'Rent growth' | 'Supply pressure' | 'Insurance risk'

export type Market = {
  id: string
  name: string
  state: 'CA' | 'FL'
  coordinates: [number, number]
  score: number
  opportunities: number
  type: Exclude<PropertyFilter, 'All types'>
  strategy: string
  change: number
  confidence: [number, number]
  rent: number
  supply: number
  liquidity: number
  insurance: number
  /** ISO timestamp of last calibration refresh */
  updatedAt: string
  sources: {
    rent: string
    supply: string
    sales: string
    insurance: string
  }
}

export type Deal = {
  id: string
  address: string
  market: string
  strategy: string
  basis: string
  irr: number
  score: number
  /** ISO date of last underwriting touch */
  updatedAt: string
}

/** Canonical coverage for the Perfect Property calibrated universe. */
export const COVERAGE_REGIONS = ['California', 'Florida'] as const

export const markets: Market[] = [
  { id: 'los-angeles', name: 'Los Angeles', state: 'CA', coordinates: [-118.2437, 34.0522], score: 94.2, opportunities: 42, type: 'Multifamily', strategy: 'Core-plus', change: 12.4, confidence: [88.1, 98.7], rent: 91, supply: 78, liquidity: 94, insurance: 57, updatedAt: '2026-07-14T08:12:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'san-diego', name: 'San Diego', state: 'CA', coordinates: [-117.1611, 32.7157], score: 91.6, opportunities: 18, type: 'Multifamily', strategy: 'Coastal infill', change: 8.7, confidence: [84.6, 96.3], rent: 88, supply: 73, liquidity: 90, insurance: 52, updatedAt: '2026-07-14T08:11:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'san-jose', name: 'San Jose', state: 'CA', coordinates: [-121.8863, 37.3382], score: 88.9, opportunities: 28, type: 'Office', strategy: 'Basis reset', change: 6.2, confidence: [80.2, 94.9], rent: 72, supply: 61, liquidity: 87, insurance: 69, updatedAt: '2026-07-14T08:09:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'sacramento', name: 'Sacramento', state: 'CA', coordinates: [-121.4944, 38.5816], score: 86.4, opportunities: 12, type: 'Build-to-rent', strategy: 'Growth', change: 9.1, confidence: [79.4, 92.8], rent: 86, supply: 84, liquidity: 74, insurance: 63, updatedAt: '2026-07-14T08:07:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'fresno', name: 'Fresno', state: 'CA', coordinates: [-119.7871, 36.7378], score: 81.7, opportunities: 9, type: 'Build-to-rent', strategy: 'Yield', change: 4.3, confidence: [73.8, 89.1], rent: 82, supply: 88, liquidity: 66, insurance: 61, updatedAt: '2026-07-14T08:05:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'miami', name: 'Miami', state: 'FL', coordinates: [-80.1918, 25.7617], score: 93.1, opportunities: 24, type: 'Multifamily', strategy: 'Value-add', change: 10.8, confidence: [86.5, 97.8], rent: 93, supply: 67, liquidity: 95, insurance: 35, updatedAt: '2026-07-14T08:12:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'tampa', name: 'Tampa', state: 'FL', coordinates: [-82.4572, 27.9506], score: 92.8, opportunities: 22, type: 'Build-to-rent', strategy: 'Growth', change: 11.2, confidence: [85.9, 97.1], rent: 92, supply: 82, liquidity: 89, insurance: 49, updatedAt: '2026-07-14T08:10:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'orlando', name: 'Orlando', state: 'FL', coordinates: [-81.3792, 28.5383], score: 89.7, opportunities: 18, type: 'Multifamily', strategy: 'Workforce', change: 7.4, confidence: [82.1, 94.5], rent: 89, supply: 76, liquidity: 83, insurance: 51, updatedAt: '2026-07-14T08:08:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
  { id: 'jacksonville', name: 'Jacksonville', state: 'FL', coordinates: [-81.6557, 30.3322], score: 84.3, opportunities: 16, type: 'Office', strategy: 'Repositioning', change: 3.9, confidence: [76.3, 90.8], rent: 71, supply: 79, liquidity: 72, insurance: 56, updatedAt: '2026-07-14T08:06:00.000Z', sources: { rent: 'County / Realie', supply: 'Distress + listings', sales: 'Deeds / comps', insurance: 'Underwrite risk model' } },
]

export const deals: Deal[] = [
  { id: 'deal-la-wilshire', address: '1234 Wilshire Boulevard', market: 'Los Angeles, CA', strategy: 'Value-add', basis: '$28.45M', irr: 18.7, score: 94.2, updatedAt: '2026-07-12' },
  { id: 'deal-la-spring', address: '850 South Spring Street', market: 'Los Angeles, CA', strategy: 'Core-plus', basis: '$34.80M', irr: 16.3, score: 91.3, updatedAt: '2026-07-12' },
  { id: 'deal-mia-brickell', address: '1441 Brickell Avenue', market: 'Miami, FL', strategy: 'Core', basis: '$52.10M', irr: 14.2, score: 88.7, updatedAt: '2026-07-11' },
  { id: 'deal-tpa-franklin', address: '201 North Franklin Street', market: 'Tampa, FL', strategy: 'Value-add', basis: '$22.75M', irr: 17.9, score: 87.1, updatedAt: '2026-07-11' },
  { id: 'deal-sd-university', address: '555 University Avenue', market: 'San Diego, CA', strategy: 'Opportunistic', basis: '$19.50M', irr: 20.4, score: 85.6, updatedAt: '2026-07-10' },
]

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const deltaSec = Math.max(0, Math.round((now - then) / 1000))
  if (deltaSec < 60) return 'Just now'
  const mins = Math.round(deltaSec / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function coverageLabel(): string {
  return COVERAGE_REGIONS.map((r) => (r === 'California' ? 'CA' : 'FL')).join(' + ')
}

export function marketSnapshotDate(list: Market[] = markets): string {
  const latest = list.reduce((acc, m) => (m.updatedAt > acc ? m.updatedAt : acc), list[0]?.updatedAt ?? new Date().toISOString())
  return latest
}

export function portfolioSummary(list: Market[] = markets) {
  const totalOpportunities = list.reduce((sum, m) => sum + m.opportunities, 0)
  const topScore = list.reduce((max, m) => Math.max(max, m.score), 0)
  const states = new Set(list.map((m) => m.state))
  const sourceFamilies = new Set(list.flatMap((m) => Object.values(m.sources)))
  const topMarkets = [...list].sort((a, b) => b.score - a.score).slice(0, 4)
  return {
    marketCount: list.length,
    totalOpportunities,
    topScore,
    stateCount: states.size,
    sourceFamilyCount: sourceFamilies.size,
    topMarkets,
    coverage: coverageLabel(),
    snapshotIso: marketSnapshotDate(list),
  }
}