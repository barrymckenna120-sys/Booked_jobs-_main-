-- 1. Column with tenant-resolving default
ALTER TABLE public.debug_logs
  ADD COLUMN organisation_id uuid DEFAULT public.get_my_org_id();

-- 2. Column comment
COMMENT ON COLUMN public.debug_logs.organisation_id IS
  'Tenant owner of the log row. Default resolves from the caller session; service_role / verify_jwt=false callers MUST pass this explicitly (column is NOT NULL, so omitting it fails loudly).';

-- 3. SELECT + DELETE policies: org scope AND existing admin/office role list (roles unchanged)
DROP POLICY IF EXISTS "Admin/office can read debug_logs" ON public.debug_logs;
CREATE POLICY "Admin/office can read debug_logs"
ON public.debug_logs FOR SELECT TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','office'])
);

DROP POLICY IF EXISTS "Admin/office can delete debug_logs" ON public.debug_logs;
CREATE POLICY "Admin/office can delete debug_logs"
ON public.debug_logs FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','office'])
);

-- 4. INSERT policy: org match as a top-level AND, engineer_id alternatives nested inside it
DROP POLICY IF EXISTS "Authenticated users can insert debug_logs" ON public.debug_logs;
CREATE POLICY "Authenticated users can insert debug_logs"
ON public.debug_logs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND organisation_id = public.get_my_org_id()
  AND (
    engineer_id IS NULL
    OR engineer_id = public.get_engineer_id(auth.uid())
    OR engineer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.id = debug_logs.engineer_id
        AND e.organisation_id = public.get_my_org_id()
        AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    )
  )
);

-- 5. Remove legacy unattributed rows. Verified pre-migration: exactly 20 rows, all dated
--    2026-04-09, all with an engineer_id matching no engineers row, so no org can be inferred.
--    Abort the whole migration if the count is anything other than 20.
DO $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.debug_logs WHERE organisation_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 20 THEN
    RAISE EXCEPTION 'ABORT: expected to delete exactly 20 legacy unattributed debug_logs rows, deleted %. NOT NULL constraint not applied.', v_deleted;
  END IF;
END $$;

-- 6. Enforce tenant attribution
ALTER TABLE public.debug_logs ALTER COLUMN organisation_id SET NOT NULL;