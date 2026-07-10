-- Stage 2: add access_token to hazard_notifications and add a public
-- token-based lookup for the Quote Acceptance page.

-- 1) hazard_notifications.access_token (nullable, unique)
ALTER TABLE public.hazard_notifications
  ADD COLUMN IF NOT EXISTS access_token uuid DEFAULT gen_random_uuid();

UPDATE public.hazard_notifications
   SET access_token = gen_random_uuid()
 WHERE access_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hazard_notifications_access_token_key
  ON public.hazard_notifications (access_token);

-- 2) Public RPC: resolve a quote by its unguessable access_token so the
-- Quote Acceptance page can load without exposing sequential quote_number.
CREATE OR REPLACE FUNCTION public.get_quote_by_token(p_token uuid)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object('quote_id', q.id)
  FROM quotes q
  WHERE q.access_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_quote_by_token(uuid) TO anon, authenticated;
