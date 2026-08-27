ALTER TABLE public.parts_requests
  ADD COLUMN IF NOT EXISTS engineer_id uuid REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS assigned_engineer_id uuid REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS customer_eircode text,
  ADD COLUMN IF NOT EXISTS boiler_brand_model text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(user_id);

DROP POLICY IF EXISTS parts_requests_update_own_open_engineer_id ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_delete_own_open_engineer_id ON public.parts_requests;

CREATE POLICY parts_requests_update_own_open_engineer_id ON public.parts_requests
FOR UPDATE TO authenticated
USING (
  organisation_id = get_my_org_id()
  AND status = 'Open'
  AND (engineer_id = auth.uid() OR assigned_engineer_id = auth.uid())
)
WITH CHECK (
  organisation_id = get_my_org_id()
  AND status IN ('Open', 'Cancelled')
  AND (engineer_id = auth.uid() OR assigned_engineer_id = auth.uid())
);

CREATE POLICY parts_requests_delete_own_open_engineer_id ON public.parts_requests
FOR DELETE TO authenticated
USING (
  organisation_id = get_my_org_id()
  AND status = 'Open'
  AND (engineer_id = auth.uid() OR assigned_engineer_id = auth.uid())
);