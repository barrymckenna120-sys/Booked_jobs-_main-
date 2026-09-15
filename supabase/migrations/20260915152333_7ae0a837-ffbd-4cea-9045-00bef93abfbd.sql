ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS tenant_config_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.organisations.tenant_config_version IS
  'BookedJobs provisioning/config version. 0 = provisioned before product defaults existed (no backfill applied). Set by provision-tenant on success.';