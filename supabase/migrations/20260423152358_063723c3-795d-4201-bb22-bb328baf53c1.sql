ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_service_role_all
ON public.conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE public.org_price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_price_list_service_role_all
ON public.org_price_list
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);