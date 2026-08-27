CREATE OR REPLACE FUNCTION public.recompute_job_parts_status(_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status text;
  v_scheduled_date date;
  v_new_status text;
  v_has_open boolean;
  v_has_ordered boolean;
  v_has_ready boolean;
BEGIN
  SELECT status, scheduled_date INTO v_current_status, v_scheduled_date
  FROM public.service_calls WHERE id = _job_id;
  IF v_current_status IS NULL THEN
    RETURN;
  END IF;

  -- Only not-yet-started statuses (plus the parts states themselves) may be
  -- overwritten. In Progress, On Site, En Route, Completed, Cancelled,
  -- archived, no_show, incoming and anything else are never touched.
  IF v_current_status NOT IN ('Pending','Scheduled','Booked',
                              'parts_needed','parts_ordered','parts_arrived') THEN
    RETURN;
  END IF;

  SELECT
    bool_or(status = 'Open'),
    bool_or(status = 'Ordered'),
    bool_or(status = 'Ready to Fit')
  INTO v_has_open, v_has_ordered, v_has_ready
  FROM public.parts_requests
  WHERE service_call_id = _job_id
    AND status IN ('Open','Ordered','Ready to Fit');

  IF COALESCE(v_has_open, false) THEN
    v_new_status := 'parts_needed';
  ELSIF COALESCE(v_has_ordered, false) THEN
    v_new_status := 'parts_ordered';
  ELSIF COALESCE(v_has_ready, false) THEN
    v_new_status := 'parts_arrived';
  ELSIF v_current_status IN ('parts_needed','parts_ordered','parts_arrived') THEN
    v_new_status := CASE WHEN v_scheduled_date IS NOT NULL THEN 'Booked' ELSE 'Pending' END;
  ELSE
    RETURN;
  END IF;

  IF v_new_status IS DISTINCT FROM v_current_status THEN
    UPDATE public.service_calls SET status = v_new_status WHERE id = _job_id;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_engineer_id(uuid) TO authenticated;

DROP POLICY IF EXISTS parts_requests_select ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_insert ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_update ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_delete ON public.parts_requests;

CREATE POLICY parts_requests_select ON public.parts_requests
FOR SELECT TO authenticated
USING (organisation_id = public.get_my_org_id());

CREATE POLICY parts_requests_insert ON public.parts_requests
FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

CREATE POLICY parts_requests_update_own_open ON public.parts_requests
FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND status = 'Open'
  AND (
    logged_by = auth.uid()
    OR assigned_to = public.get_engineer_id(auth.uid())
  )
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND status IN ('Open', 'Cancelled')
  AND (
    logged_by = auth.uid()
    OR assigned_to = public.get_engineer_id(auth.uid())
  )
);

CREATE POLICY parts_requests_delete_own_open ON public.parts_requests
FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND status = 'Open'
  AND (
    logged_by = auth.uid()
    OR assigned_to = public.get_engineer_id(auth.uid())
  )
);

CREATE POLICY parts_requests_update_office ON public.parts_requests
FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
);

CREATE POLICY parts_requests_delete_office ON public.parts_requests
FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
);