
CREATE TABLE public.bulk_lookup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_lookup_jobs TO authenticated;
GRANT ALL ON public.bulk_lookup_jobs TO service_role;
ALTER TABLE public.bulk_lookup_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read jobs" ON public.bulk_lookup_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert jobs" ON public.bulk_lookup_jobs FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.bulk_lookup_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.bulk_lookup_jobs(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT,
  county TEXT,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  parcel_id UUID REFERENCES public.parcels(id) ON DELETE SET NULL,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX bulk_lookup_items_pending_idx ON public.bulk_lookup_items (status, created_at) WHERE status = 'pending';
CREATE INDEX bulk_lookup_items_job_idx ON public.bulk_lookup_items (job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_lookup_items TO authenticated;
GRANT ALL ON public.bulk_lookup_items TO service_role;
ALTER TABLE public.bulk_lookup_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read items" ON public.bulk_lookup_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert items" ON public.bulk_lookup_items FOR INSERT TO authenticated WITH CHECK (true);
