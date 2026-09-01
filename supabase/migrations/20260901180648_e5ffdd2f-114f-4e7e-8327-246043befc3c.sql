CREATE TABLE public.job_engineers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.engineers(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, engineer_id)
);

CREATE INDEX idx_job_engineers_job_id ON public.job_engineers(job_id);
CREATE INDEX idx_job_engineers_engineer_id ON public.job_engineers(engineer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_engineers TO authenticated;
GRANT ALL ON public.job_engineers TO service_role;

ALTER TABLE public.job_engineers ENABLE ROW LEVEL SECURITY;

-- Guard: max 2 assist rows per job, and never the job's primary assigned engineer
CREATE OR REPLACE FUNCTION public.validate_job_engineer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assigned uuid;
  _count integer;
BEGIN
  SELECT assigned_engineer_id INTO _assigned
  FROM public.service_calls WHERE id = NEW.job_id;

  IF _assigned IS NOT NULL AND NEW.engineer_id = _assigned THEN
    RAISE EXCEPTION 'Engineer is already the primary assigned engineer for this job';
  END IF;

  SELECT count(*) INTO _count
  FROM public.job_engineers
  WHERE job_id = NEW.job_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _count >= 2 THEN
    RAISE EXCEPTION 'A job can have at most 2 additional engineers';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_job_engineer_trg
BEFORE INSERT OR UPDATE ON public.job_engineers
FOR EACH ROW EXECUTE FUNCTION public.validate_job_engineer();

-- Engineers: read-only access to their own assist rows
CREATE POLICY "job_engineers_select_own"
ON public.job_engineers FOR SELECT TO authenticated
USING (engineer_id = public.get_engineer_id(auth.uid()));

-- Office / admin / office-access engineers: full access within their org
CREATE POLICY "job_engineers_office_select"
ON public.job_engineers FOR SELECT TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) IN ('superadmin','admin','office','owner','manager')
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role IN ('admin','office','owner','manager') OR e.can_access_office = true)
    )
  )
);

CREATE POLICY "job_engineers_office_insert"
ON public.job_engineers FOR INSERT TO authenticated
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) IN ('superadmin','admin','office','owner','manager')
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role IN ('admin','office','owner','manager') OR e.can_access_office = true)
    )
  )
);

CREATE POLICY "job_engineers_office_update"
ON public.job_engineers FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) IN ('superadmin','admin','office','owner','manager')
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role IN ('admin','office','owner','manager') OR e.can_access_office = true)
    )
  )
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) IN ('superadmin','admin','office','owner','manager')
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role IN ('admin','office','owner','manager') OR e.can_access_office = true)
    )
  )
);

CREATE POLICY "job_engineers_office_delete"
ON public.job_engineers FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) IN ('superadmin','admin','office','owner','manager')
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role IN ('admin','office','owner','manager') OR e.can_access_office = true)
    )
  )
);