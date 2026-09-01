DROP POLICY IF EXISTS "Office can view own org engineer notes" ON public.engineer_performance_notes;
DROP POLICY IF EXISTS "Office can create own org engineer notes" ON public.engineer_performance_notes;
DROP POLICY IF EXISTS "Office can update own org engineer notes" ON public.engineer_performance_notes;
DROP POLICY IF EXISTS "Office can delete own org engineer notes" ON public.engineer_performance_notes;

CREATE POLICY "Office can view own org engineer notes"
ON public.engineer_performance_notes FOR SELECT TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','owner','superadmin')
);

CREATE POLICY "Office can create own org engineer notes"
ON public.engineer_performance_notes FOR INSERT TO authenticated
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','owner','superadmin')
);

CREATE POLICY "Office can update own org engineer notes"
ON public.engineer_performance_notes FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','owner','superadmin')
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','owner','superadmin')
);

CREATE POLICY "Office can delete own org engineer notes"
ON public.engineer_performance_notes FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','owner','superadmin')
);