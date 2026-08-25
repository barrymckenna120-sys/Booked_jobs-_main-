ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organisations.is_test IS
  'True only for throwaway test tenants. Hard gate for destructive org data reset; must never be true for a live tenant.';