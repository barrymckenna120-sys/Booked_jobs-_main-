CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stamp text NOT NULL UNIQUE CHECK (stamp ~ '^\d{4}-\d{2}-\d{2}-\d{4}$'),
  s3_key text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.backup_run_tenants (
  backup_run_id uuid NOT NULL REFERENCES public.backup_runs(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  counts jsonb NOT NULL,
  PRIMARY KEY (backup_run_id, organisation_id)
);
CREATE INDEX backup_run_tenants_org_idx
  ON public.backup_run_tenants (organisation_id, backup_run_id);

CREATE TABLE public.tenant_restores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  backup_stamp text NOT NULL CHECK (backup_stamp ~ '^\d{4}-\d{2}-\d{2}-\d{4}$'),
  mode text NOT NULL CHECK (mode IN ('dry_run','recover_missing','full_rollback')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  github_run_id bigint,
  report jsonb,
  error text
);
CREATE INDEX tenant_restores_org_idx
  ON public.tenant_restores (organisation_id, requested_at DESC);
-- only one active restore per tenant at a time
CREATE UNIQUE INDEX tenant_restores_one_active
  ON public.tenant_restores (organisation_id)
  WHERE status IN ('queued','running');

ALTER TABLE public.backup_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_run_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_restores    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.backup_runs, public.backup_run_tenants, public.tenant_restores
  FROM anon, authenticated;
GRANT SELECT ON public.backup_runs, public.backup_run_tenants, public.tenant_restores
  TO authenticated;

CREATE POLICY "Superadmins read backup runs" ON public.backup_runs
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins read backup run tenants" ON public.backup_run_tenants
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins read tenant restores" ON public.tenant_restores
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies on purpose: writes come only from the
-- backup/restore jobs and a superadmin-only Edge Function (service role).