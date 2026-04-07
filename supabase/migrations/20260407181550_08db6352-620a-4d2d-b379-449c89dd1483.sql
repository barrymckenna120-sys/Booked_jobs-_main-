
DROP POLICY IF EXISTS "Users can insert their own quotes" ON public.quotes;

CREATE POLICY "Users can insert org quotes" ON public.quotes
FOR INSERT TO authenticated
WITH CHECK (
  organisation_id = (
    SELECT organisation_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);
