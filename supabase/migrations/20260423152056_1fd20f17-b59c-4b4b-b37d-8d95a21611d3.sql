-- Helper: get the organisation_id for the current user (admin/office)
-- Uses engineers.auth_user_id mapping (same as get_user_role/get_engineer_id)
CREATE OR REPLACE FUNCTION public.get_user_organisation_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisation_id
  FROM public.engineers
  WHERE auth_user_id = _user_id
  LIMIT 1;
$$;

-- Replace the SELECT policy on service_calls so admin/office users can see
-- all jobs in their organisation, not just rows where user_id = auth.uid().
DROP POLICY IF EXISTS service_calls_select ON public.service_calls;

CREATE POLICY service_calls_select
ON public.service_calls
FOR SELECT
TO authenticated
USING (
  CASE get_user_role(auth.uid())
    WHEN 'engineer' THEN assigned_engineer_id = get_engineer_id(auth.uid())
    ELSE (
      auth.uid() = user_id
      OR (
        organisation_id IS NOT NULL
        AND organisation_id = get_user_organisation_id(auth.uid())
      )
    )
  END
);