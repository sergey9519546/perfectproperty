/** Shape returned by listRankedParcels (parcel_scores ⋈ parcels). */
export type RankedParcelRow = {
  parcel_id: string
  perfect_score: number | null
  gross_profit: number | null
  risk_adjusted_profit: number | null
  modeled_offer: number | null
  acquisition_probability: number | null
  exit_days: number | null
  ring: number | null
  confidence_grade: string | null
  skeptic_flags: unknown
  recommended_scope: string | null
  reno_cost: number | null
  data_source: string | null
  computed_at: string | null
  mc_profit_p5: number | null
  mc_profit_p50: number | null
  mc_p_loss: number | null
  cosmetic_arv: number | null
  full_reno_arv: number | null
  expanded_arv: number | null
  as_is_value: number | null
  carry_cost: number | null
  selling_cost: number | null
  ead: number | null
  pd_credit: number | null
  lgd: number | null
  risk_adjusted_profit_credit: number | null
  parcels: {
    id: string
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    lat: number | null
    lng: number | null
    living_sqft: number | null
    year_built: number | null
    bedrooms: number | null
    bathrooms: number | null
    condition_grade: string | null
    owner_is_absentee: boolean | null
    is_listed: boolean | null
    is_vacant: boolean | null
    county_fips: string | null
    data_source: string | null
  } | null
}