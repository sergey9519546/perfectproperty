
REVOKE ALL ON FUNCTION public.seed_scrape_targets_from_templates(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_scrape_targets_from_templates(text) TO service_role;

REVOKE ALL ON FUNCTION public.tg_counties_seed_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_counties_seed_targets() TO service_role;

REVOKE ALL ON FUNCTION public.tg_touch_updated_at() FROM PUBLIC;
