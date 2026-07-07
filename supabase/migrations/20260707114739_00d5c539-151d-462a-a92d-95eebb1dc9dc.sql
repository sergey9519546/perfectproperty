
-- ============================================================================
-- PROPERTY GENOME SCHEMA — Layer 1..5 of the underwriting engine
-- Internal tool: anon read allowed, no writes from client.
-- ============================================================================

CREATE TABLE public.counties (
  fips TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  parcel_count INTEGER NOT NULL DEFAULT 0,
  last_ingested_at TIMESTAMPTZ,
  coverage_pct NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.counties TO anon, authenticated;
GRANT ALL ON public.counties TO service_role;
ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counties_read" ON public.counties FOR SELECT USING (true);

-- Layer 1: Property Genome
CREATE TABLE public.parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apn TEXT NOT NULL,
  county_fips TEXT NOT NULL REFERENCES public.counties(fips),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  -- Physical DNA
  property_type TEXT NOT NULL DEFAULT 'SFR',
  year_built INTEGER,
  living_sqft INTEGER,
  lot_sqft INTEGER,
  bedrooms INTEGER,
  bathrooms NUMERIC,
  stories INTEGER,
  -- Condition & geography
  condition_grade TEXT,           -- A/B/C/D
  flood_zone TEXT,
  school_score INTEGER,
  -- Ownership psychology
  owner_name TEXT,
  owner_is_absentee BOOLEAN NOT NULL DEFAULT false,
  owner_is_corporate BOOLEAN NOT NULL DEFAULT false,
  owner_since DATE,
  assessed_value NUMERIC,
  estimated_equity NUMERIC,
  -- Status
  is_listed BOOLEAN NOT NULL DEFAULT false,
  is_vacant BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(county_fips, apn)
);
CREATE INDEX parcels_county_idx ON public.parcels(county_fips);
CREATE INDEX parcels_geo_idx ON public.parcels(lat, lng);
GRANT SELECT ON public.parcels TO anon, authenticated;
GRANT ALL ON public.parcels TO service_role;
ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcels_read" ON public.parcels FOR SELECT USING (true);

-- Transaction bloodline
CREATE TABLE public.deeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL,
  deed_type TEXT NOT NULL,        -- WARRANTY | QUITCLAIM | FORECLOSURE | TRUSTEE
  sale_price NUMERIC,
  buyer TEXT,
  seller TEXT,
  loan_amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deeds_parcel_idx ON public.deeds(parcel_id);
GRANT SELECT ON public.deeds TO anon, authenticated;
GRANT ALL ON public.deeds TO service_role;
ALTER TABLE public.deeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deeds_read" ON public.deeds FOR SELECT USING (true);

-- Legal weather / distress signals (Ring 2 raw material)
CREATE TABLE public.distress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,       -- FORECLOSURE_NOD | TAX_LIEN | PROBATE | CODE_VIOLATION | VACANCY | AUCTION_SCHEDULED
  event_date DATE NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1, -- 1..5
  amount NUMERIC,
  details JSONB DEFAULT '{}'::jsonb,
  auction_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX distress_parcel_idx ON public.distress_events(parcel_id);
CREATE INDEX distress_type_idx ON public.distress_events(event_type);
GRANT SELECT ON public.distress_events TO anon, authenticated;
GRANT ALL ON public.distress_events TO service_role;
ALTER TABLE public.distress_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distress_read" ON public.distress_events FOR SELECT USING (true);

-- MLS listings (Ring 1)
CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  listed_at DATE NOT NULL,
  list_price NUMERIC NOT NULL,
  original_price NUMERIC,
  status TEXT NOT NULL,            -- ACTIVE | PENDING | SOLD | WITHDRAWN
  dom INTEGER,
  price_cuts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listings_parcel_idx ON public.listings(parcel_id);
GRANT SELECT ON public.listings TO anon, authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_read" ON public.listings FOR SELECT USING (true);

-- Layer 2+3: Underwriting output — one live row per parcel
CREATE TABLE public.parcel_scores (
  parcel_id UUID PRIMARY KEY REFERENCES public.parcels(id) ON DELETE CASCADE,
  -- Value ladder
  as_is_value NUMERIC NOT NULL,
  cosmetic_arv NUMERIC NOT NULL,
  full_reno_arv NUMERIC NOT NULL,
  expanded_arv NUMERIC NOT NULL,
  -- Costs for the recommended scope
  recommended_scope TEXT NOT NULL, -- COSMETIC | FULL | EXPANDED
  reno_cost NUMERIC NOT NULL,
  carry_cost NUMERIC NOT NULL,
  selling_cost NUMERIC NOT NULL,
  -- Acquisition
  modeled_offer NUMERIC NOT NULL,
  acquisition_probability NUMERIC NOT NULL,
  -- Exit
  exit_days INTEGER NOT NULL,
  exit_confidence NUMERIC NOT NULL,
  -- Formula outputs
  gross_profit NUMERIC NOT NULL,
  risk_adjusted_profit NUMERIC NOT NULL,
  perfect_score NUMERIC NOT NULL,           -- 0..100
  confidence_grade TEXT NOT NULL,           -- A..F
  skeptic_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ring INTEGER NOT NULL DEFAULT 1,          -- 1 open, 2 shadow, 3 prophecy
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scores_perfect_idx ON public.parcel_scores(perfect_score DESC);
CREATE INDEX scores_ring_idx ON public.parcel_scores(ring, perfect_score DESC);
GRANT SELECT ON public.parcel_scores TO anon, authenticated;
GRANT ALL ON public.parcel_scores TO service_role;
ALTER TABLE public.parcel_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores_read" ON public.parcel_scores FOR SELECT USING (true);

-- Layer 5: Learning loop
CREATE TABLE public.prediction_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  predicted_arv NUMERIC NOT NULL,
  predicted_profit NUMERIC NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL,
  actual_sale_price NUMERIC,
  actual_profit NUMERIC,
  actual_sold_at DATE,
  outcome TEXT,                    -- WIN | BREAKEVEN | LOSS | STUCK
  error_pct NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outcomes_parcel_idx ON public.prediction_outcomes(parcel_id);
GRANT SELECT ON public.prediction_outcomes TO anon, authenticated;
GRANT ALL ON public.prediction_outcomes TO service_role;
ALTER TABLE public.prediction_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outcomes_read" ON public.prediction_outcomes FOR SELECT USING (true);

-- Ingestion audit
CREATE TABLE public.ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_fips TEXT NOT NULL REFERENCES public.counties(fips),
  source TEXT NOT NULL,            -- PARCELS | DEEDS | DISTRESS | MLS | AGGREGATOR
  status TEXT NOT NULL,            -- OK | PARTIAL | FAILED
  rows_ingested INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT ON public.ingestion_runs TO anon, authenticated;
GRANT ALL ON public.ingestion_runs TO service_role;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "runs_read" ON public.ingestion_runs FOR SELECT USING (true);
