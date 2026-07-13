
-- Purge all FIXTURE-tagged rows. LIVE rows are untouched.
DELETE FROM public.parcel_scores WHERE data_source = 'FIXTURE';
DELETE FROM public.listings      WHERE data_source = 'FIXTURE';
DELETE FROM public.distress_events WHERE data_source = 'FIXTURE';
DELETE FROM public.deeds         WHERE parcel_id IN (SELECT id FROM public.parcels WHERE data_source = 'FIXTURE');
DELETE FROM public.parcels       WHERE data_source = 'FIXTURE';

-- Drop the demo-seed run rows so /admin history is real-only.
DELETE FROM public.ingestion_runs WHERE source IN ('FIXTURE_SEED','FIXTURE');

-- Recompute counties.parcel_count from actual rows.
UPDATE public.counties c
   SET parcel_count = COALESCE(p.n, 0),
       last_ingested_at = COALESCE(p.last_seen, c.last_ingested_at)
  FROM (
    SELECT county_fips, COUNT(*) AS n, MAX(last_seen_at) AS last_seen
      FROM public.parcels
     GROUP BY county_fips
  ) p
 WHERE p.county_fips = c.fips;

-- Zero out counties that no longer have any parcels.
UPDATE public.counties SET parcel_count = 0
 WHERE fips NOT IN (SELECT DISTINCT county_fips FROM public.parcels);
