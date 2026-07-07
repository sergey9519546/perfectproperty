CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_fips TEXT NOT NULL REFERENCES public.counties(fips),
  external_apn TEXT NOT NULL,
  parcel_id UUID REFERENCES public.parcels(id) ON DELETE SET NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  sold_at DATE NOT NULL,
  sale_price NUMERIC NOT NULL,
  living_sqft INTEGER,
  land_sqft INTEGER,
  year_built INTEGER,
  building_class TEXT,
  data_source TEXT NOT NULL DEFAULT 'LIVE',
  source_url TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(county_fips, external_apn, sold_at, sale_price)
);
CREATE INDEX sales_county_idx ON public.sales(county_fips);
CREATE INDEX sales_parcel_idx ON public.sales(parcel_id);
CREATE INDEX sales_date_idx ON public.sales(sold_at DESC);
CREATE INDEX sales_apn_idx ON public.sales(county_fips, external_apn);
GRANT SELECT ON public.sales TO anon, authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_read ON public.sales FOR SELECT USING (true);

ALTER TABLE public.parcel_scores
  ADD COLUMN IF NOT EXISTS comps_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comp_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arv_source TEXT NOT NULL DEFAULT 'HEURISTIC';

-- Comp selector. Joins sales → parcels for geometry, filters by sqft band,
-- returns nearest N with $/sqft and haversine distance.
CREATE OR REPLACE FUNCTION public.pick_comps(
  subject_lat DOUBLE PRECISION,
  subject_lng DOUBLE PRECISION,
  subject_sqft INTEGER,
  subject_county TEXT,
  max_km DOUBLE PRECISION DEFAULT 3.0,
  sqft_tolerance DOUBLE PRECISION DEFAULT 0.35,
  months_back INTEGER DEFAULT 18,
  max_results INTEGER DEFAULT 8
) RETURNS TABLE (
  sale_id UUID,
  address TEXT,
  sold_at DATE,
  sale_price NUMERIC,
  living_sqft INTEGER,
  ppsf NUMERIC,
  distance_km DOUBLE PRECISION
) LANGUAGE sql STABLE SET search_path = public AS $$
  WITH candidates AS (
    SELECT
      s.id AS sale_id,
      COALESCE(s.address, p.address) AS address,
      s.sold_at,
      s.sale_price,
      COALESCE(s.living_sqft, p.living_sqft) AS living_sqft,
      COALESCE(s.lat, p.lat) AS lat,
      COALESCE(s.lng, p.lng) AS lng
    FROM public.sales s
    LEFT JOIN public.parcels p ON p.id = s.parcel_id
    WHERE s.county_fips = subject_county
      AND s.sold_at >= (CURRENT_DATE - (months_back || ' months')::interval)::date
      AND s.sale_price > 20000
  )
  SELECT
    c.sale_id, c.address, c.sold_at, c.sale_price, c.living_sqft,
    (c.sale_price / NULLIF(c.living_sqft, 0))::numeric AS ppsf,
    (6371 * acos(LEAST(1.0,
      cos(radians(subject_lat)) * cos(radians(c.lat)) *
      cos(radians(c.lng) - radians(subject_lng)) +
      sin(radians(subject_lat)) * sin(radians(c.lat))
    )))::double precision AS distance_km
  FROM candidates c
  WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
    AND c.living_sqft > 0
    AND ABS(c.living_sqft - subject_sqft) <= (subject_sqft * sqft_tolerance)
    AND (6371 * acos(LEAST(1.0,
      cos(radians(subject_lat)) * cos(radians(c.lat)) *
      cos(radians(c.lng) - radians(subject_lng)) +
      sin(radians(subject_lat)) * sin(radians(c.lat))
    ))) <= max_km
  ORDER BY distance_km ASC
  LIMIT max_results
$$;
GRANT EXECUTE ON FUNCTION public.pick_comps TO anon, authenticated, service_role;