DELETE FROM public.parcels
WHERE county_fips = '36061' AND data_source = 'LIVE' AND apn LIKE '%.%';