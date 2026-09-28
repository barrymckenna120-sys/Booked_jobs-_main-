CREATE OR REPLACE FUNCTION public.claim_post_payment_messages(p_limit int DEFAULT 25, p_service_call_id uuid DEFAULT NULL)
RETURNS SETOF public.post_payment_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.post_payment_messages
     SET status = 'sending', attempts = attempts + 1, not_before = now() + interval '10 minutes'
   WHERE id IN (
     SELECT id FROM public.post_payment_messages
      WHERE status = 'pending'
        AND not_before <= now()
        AND (p_service_call_id IS NULL OR service_call_id = p_service_call_id)
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_post_payment_messages(int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_payment_messages(int, uuid) TO service_role;