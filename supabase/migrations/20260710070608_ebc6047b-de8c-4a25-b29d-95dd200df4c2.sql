
ALTER TABLE public.bulk_lookup_items
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

DO $$ BEGIN
  ALTER TABLE public.bulk_lookup_items
    ADD CONSTRAINT bulk_lookup_items_status_chk
    CHECK (status IN ('pending','running','succeeded','failed','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.bulk_lookup_jobs
    ADD CONSTRAINT bulk_lookup_jobs_status_chk
    CHECK (status IN ('pending','running','done','failed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill sales.parcel_id via APN (external_apn) then normalized address
UPDATE public.sales s SET parcel_id = p.id
FROM public.parcels p
WHERE s.parcel_id IS NULL
  AND s.county_fips = p.county_fips
  AND s.external_apn IS NOT NULL AND s.external_apn = p.apn;

UPDATE public.sales s SET parcel_id = p.id
FROM public.parcels p
WHERE s.parcel_id IS NULL
  AND s.county_fips = p.county_fips
  AND s.address IS NOT NULL
  AND public.normalize_address_full(s.address) = public.normalize_address_full(p.address);

UPDATE public.sales s
SET lat = COALESCE(s.lat, p.lat), lng = COALESCE(s.lng, p.lng)
FROM public.parcels p
WHERE s.parcel_id = p.id AND (s.lat IS NULL OR s.lng IS NULL)
  AND p.lat IS NOT NULL AND p.lng IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sales_backfill_parcel_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.parcel_id IS NULL THEN
    NEW.parcel_id := public.match_parcel(NEW.county_fips, NEW.external_apn, NEW.address, NULL);
  END IF;
  IF NEW.parcel_id IS NOT NULL AND (NEW.lat IS NULL OR NEW.lng IS NULL) THEN
    SELECT COALESCE(NEW.lat, p.lat), COALESCE(NEW.lng, p.lng)
      INTO NEW.lat, NEW.lng FROM public.parcels p WHERE p.id = NEW.parcel_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_backfill_parcel_id_trg ON public.sales;
CREATE TRIGGER sales_backfill_parcel_id_trg
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sales_backfill_parcel_id();

CREATE OR REPLACE FUNCTION public.pick_comps(
  subject_lat double precision, subject_lng double precision,
  subject_sqft integer, subject_county text,
  max_km double precision DEFAULT 3.0, sqft_tolerance double precision DEFAULT 0.35,
  months_back integer DEFAULT 18, max_results integer DEFAULT 8
) RETURNS TABLE(
  sale_id uuid, address text, sold_at date, sale_price numeric,
  living_sqft integer, ppsf numeric, distance_km double precision
) LANGUAGE sql STABLE SET search_path = public AS $$
  WITH candidates AS (
    SELECT
      s.id AS sale_id,
      COALESCE(s.address, p.address) AS address,
      s.sold_at, s.sale_price,
      COALESCE(s.living_sqft, p.living_sqft) AS living_sqft,
      COALESCE(s.lat, p.lat) AS lat,
      COALESCE(s.lng, p.lng) AS lng
    FROM public.sales s
    LEFT JOIN public.parcels p ON (
      p.id = s.parcel_id
      OR (s.parcel_id IS NULL
          AND p.county_fips = s.county_fips
          AND public.normalize_address_full(p.address) = public.normalize_address_full(s.address))
    )
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

DO $$ BEGIN
  ALTER TABLE public.parcel_scores
    ADD CONSTRAINT parcel_scores_prob_chk CHECK (
      (acquisition_probability IS NULL OR (acquisition_probability >= 0 AND acquisition_probability <= 1)) AND
      (pd_credit IS NULL OR (pd_credit >= 0 AND pd_credit <= 1)) AND
      (mc_p_loss IS NULL OR (mc_p_loss >= 0 AND mc_p_loss <= 1)) AND
      (lgd IS NULL OR (lgd >= 0 AND lgd <= 1))
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
