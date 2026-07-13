-- Grant admin role to both signed-in users so admin pages open.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- Fix ring semantics on already-scored parcels.
-- Old logic left ring=1 (labelled "Listed") on every parcel even when unlisted.
-- Correct interpretation: ring=1 = listed on market, ring=2 = off-market, ring=3 = predicted.
UPDATE public.parcel_scores ps
SET ring = CASE
    WHEN p.is_listed IS TRUE THEN 1
    WHEN EXISTS (
      SELECT 1 FROM public.distress_events de
      WHERE de.parcel_id = p.id AND de.event_type = 'FORECLOSURE_NOD'
        AND NOT EXISTS (
          SELECT 1 FROM public.distress_events de2
          WHERE de2.parcel_id = p.id AND de2.event_type = 'AUCTION_SCHEDULED'
        )
    ) THEN 3
    ELSE 2
  END
FROM public.parcels p
WHERE ps.parcel_id = p.id;