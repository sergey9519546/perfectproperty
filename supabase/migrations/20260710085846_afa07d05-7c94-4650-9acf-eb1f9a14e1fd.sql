
-- Move has_role out of the API-exposed public schema into a private schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Recreate has_role in private schema
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Update RLS policies to reference the private function
DROP POLICY IF EXISTS "adapter_recipes insert" ON public.adapter_recipes;
DROP POLICY IF EXISTS "adapter_recipes update" ON public.adapter_recipes;
DROP POLICY IF EXISTS "adapter_recipes delete" ON public.adapter_recipes;

CREATE POLICY "adapter_recipes insert" ON public.adapter_recipes
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "adapter_recipes update" ON public.adapter_recipes
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "adapter_recipes delete" ON public.adapter_recipes
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Drop the public wrapper now that policies no longer depend on it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- Recreate a public wrapper ONLY if something still calls it via RPC.
-- (Server code uses supabase.rpc('has_role', ...); keep the API stable.)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  select private.has_role(_user_id, _role)
$$;

-- Only admins (already authenticated) should call this via RPC.
-- Revoke from everyone; grant execute to authenticated so the require-admin
-- middleware's rpc('has_role', ...) works. Anon has no reason to call it.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
