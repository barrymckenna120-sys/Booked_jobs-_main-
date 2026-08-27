GRANT SELECT ON public.payment_checkout_attempts TO authenticated;

CREATE POLICY "Admin/office can read payment_checkout_attempts"
ON public.payment_checkout_attempts
FOR SELECT
TO authenticated
USING (
  organisation_id = get_my_org_id()
  AND get_user_role(auth.uid()) = ANY (ARRAY['admin','office','owner','manager'])
);