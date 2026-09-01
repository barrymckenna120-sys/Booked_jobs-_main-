CREATE POLICY "job_engineers_select_lead_assists"
  ON public.job_engineers
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = get_my_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.service_calls sc
      WHERE sc.id = job_engineers.job_id
        AND sc.assigned_engineer_id = get_engineer_id(auth.uid())
    )
  );