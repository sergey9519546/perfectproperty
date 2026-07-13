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
  updated: string
}

export type Deal = {
  id: number
  address: string
  market: string
  strategy: string
  basis: string
  irr: number
  score: number
  updated: string
}

export const markets: Market[] = [
  { id: 'los-angeles', name: 'Los Angeles', state: 'CA', coordinates: [-118.2437, 34.0522], score: 94.2, opportunities: 42, type: 'Multifamily', strategy: 'Core-plus', change: 12.4, confidence: [88.1, 98.7], rent: 91, supply: 78, liquidity: 94, insurance: 57, updated: '8 min ago' },
  { id: 'san-diego', name: 'San Diego', state: 'CA', coordinates: [-117.1611, 32.7157], score: 91.6, opportunities: 18, type: 'Multifamily', strategy: 'Coastal infill', change: 8.7, confidence: [84.6, 96.3], rent: 88, supply: 73, liquidity: 90, insurance: 52, updated: '11 min ago' },
  { id: 'san-jose', name: 'San Jose', state: 'CA', coordinates: [-121.8863, 37.3382], score: 88.9, opportunities: 28, type: 'Office', strategy: 'Basis reset', change: 6.2, confidence: [80.2, 94.9], rent: 72, supply: 61, liquidity: 87, insurance: 69, updated: '14 min ago' },
  { id: 'sacramento', name: 'Sacramento', state: 'CA', coordinates: [-121.4944, 38.5816], score: 86.4, opportunities: 12, type: 'Build-to-rent', strategy: 'Growth', change: 9.1, confidence: [79.4, 92.8], rent: 86, supply: 84, liquidity: 74, insurance: 63, updated: '18 min ago' },
  { id: 'fresno', name: 'Fresno', state: 'CA', coordinates: [-119.7871, 36.7378], score: 81.7, opportunities: 9, type: 'Build-to-rent', strategy: 'Yield', change: 4.3, confidence: [73.8, 89.1], rent: 82, supply: 88, liquidity: 66, insurance: 61, updated: '23 min ago' },
  { id: 'miami', name: 'Miami', state: 'FL', coordinates: [-80.1918, 25.7617], score: 93.1, opportunities: 24, type: 'Multifamily', strategy: 'Value-add', change: 10.8, confidence: [86.5, 97.8], rent: 93, supply: 67, liquidity: 95, insurance: 35, updated: '9 min ago' },
  { id: 'tampa', name: 'Tampa', state: 'FL', coordinates: [-82.4572, 27.9506], score: 92.8, opportunities: 22, type: 'Build-to-rent', strategy: 'Growth', change: 11.2, confidence: [85.9, 97.1], rent: 92, supply: 82, liquidity: 89, insurance: 49, updated: '12 min ago' },
  { id: 'orlando', name: 'Orlando', state: 'FL', coordinates: [-81.3792, 28.5383], score: 89.7, opportunities: 18, type: 'Multifamily', strategy: 'Workforce', change: 7.4, confidence: [82.1, 94.5], rent: 89, supply: 76, liquidity: 83, insurance: 51, updated: '16 min ago' },
  { id: 'jacksonville', name: 'Jacksonville', state: 'FL', coordinates: [-81.6557, 30.3322], score: 84.3, opportunities: 16, type: 'Office', strategy: 'Repositioning', change: 3.9, confidence: [76.3, 90.8], rent: 71, supply: 79, liquidity: 72, insurance: 56, updated: '21 min ago' },
]

export const deals: Deal[] = [
  { id: 1, address: '1234 Wilshire Boulevard', market: 'Los Angeles, CA', strategy: 'Value-add', basis: '$28.45M', irr: 18.7, score: 94.2, updated: 'May 12' },
  { id: 2, address: '850 South Spring Street', market: 'Los Angeles, CA', strategy: 'Core-plus', basis: '$34.80M', irr: 16.3, score: 91.3, updated: 'May 12' },
  { id: 3, address: '1441 Brickell Avenue', market: 'Miami, FL', strategy: 'Core', basis: '$52.10M', irr: 14.2, score: 88.7, updated: 'May 11' },
  { id: 4, address: '201 North Franklin Street', market: 'Tampa, FL', strategy: 'Value-add', basis: '$22.75M', irr: 17.9, score: 87.1, updated: 'May 11' },
  { id: 5, address: '555 University Avenue', market: 'San Diego, CA', strategy: 'Opportunistic', basis: '$19.50M', irr: 20.4, score: 85.6, updated: 'May 10' },
]

