CREATE POLICY "anon_select_invoices"
ON public.invoices
FOR SELECT
TO anon
USING (true);