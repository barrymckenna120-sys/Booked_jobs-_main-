CREATE TABLE public.post_payment_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  service_call_id uuid NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  customer_id uuid,
  message_type text NOT NULL CHECK (message_type IN ('warranty_welcome')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','failed')),
  not_before timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_call_id, message_type)
);
CREATE INDEX post_payment_messages_status_not_before_idx ON public.post_payment_messages (status, not_before);

GRANT SELECT ON public.post_payment_messages TO authenticated;
GRANT ALL ON public.post_payment_messages TO service_role;
REVOKE ALL ON public.post_payment_messages FROM anon;

ALTER TABLE public.post_payment_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view post payment messages"
ON public.post_payment_messages FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_post_payment_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.restoring', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
      INSERT INTO public.post_payment_messages (message_type, organisation_id, service_call_id, customer_id)
      VALUES ('warranty_welcome', NEW.organisation_id, NEW.id, NEW.customer_id)
      ON CONFLICT (service_call_id, message_type) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_post_payment_messages failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_post_payment_messages
AFTER UPDATE OF payment_status ON public.service_calls
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
EXECUTE FUNCTION public.enqueue_post_payment_messages();

CREATE OR REPLACE FUNCTION public.claim_post_payment_messages(p_limit int DEFAULT 25, p_service_call_id uuid DEFAULT NULL)
RETURNS SETOF public.post_payment_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.post_payment_messages
     SET status = 'sending', attempts = attempts + 1
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
REVOKE ALL ON FUNCTION public.enqueue_post_payment_messages() FROM PUBLIC, anon, authenticated;