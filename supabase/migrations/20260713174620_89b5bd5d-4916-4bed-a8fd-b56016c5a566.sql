
CREATE TABLE public.realie_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parcel_id UUID NULL REFERENCES public.parcels(id) ON DELETE SET NULL,
  county_fips TEXT NULL,
  endpoint TEXT NOT NULL,
  request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  http_status INTEGER NULL,
  ok BOOLEAN NOT NULL DEFAULT false,
  duration_ms INTEGER NULL,
  outcome TEXT NOT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  fields_returned TEXT[] NULL,
  fields_missing TEXT[] NULL,
  response_sample JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX realie_audit_created_idx ON public.realie_audit (created_at DESC);
CREATE INDEX realie_audit_parcel_idx ON public.realie_audit (parcel_id, created_at DESC);
CREATE INDEX realie_audit_outcome_idx ON public.realie_audit (outcome, created_at DESC);

GRANT ALL ON public.realie_audit TO service_role;
GRANT SELECT ON public.realie_audit TO authenticated;

ALTER TABLE public.realie_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read realie audit"
  ON public.realie_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
