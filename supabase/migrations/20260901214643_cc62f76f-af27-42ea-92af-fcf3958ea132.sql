-- 1. Widen the allowed states on the current-state table.
ALTER TABLE public.communication_deliveries
  DROP CONSTRAINT IF EXISTS communication_deliveries_status_chk;

ALTER TABLE public.communication_deliveries
  ADD CONSTRAINT communication_deliveries_status_chk
  CHECK (delivery_status = ANY (ARRAY[
    'pending'::text,
    'accepted'::text,
    'sent'::text,
    'delivered'::text,
    'delivery_unknown'::text,
    'failed'::text,
    'opted_out'::text
  ]));

-- 2. Same vocabulary on the append-only attempts table.
ALTER TABLE public.communication_delivery_attempts
  DROP CONSTRAINT IF EXISTS communication_delivery_attempts_outcome_chk;

ALTER TABLE public.communication_delivery_attempts
  ADD CONSTRAINT communication_delivery_attempts_outcome_chk
  CHECK (outcome = ANY (ARRAY[
    'pending'::text,
    'accepted'::text,
    'sent'::text,
    'delivered'::text,
    'delivery_unknown'::text,
    'failed'::text,
    'opted_out'::text
  ]));

-- 3. Timeline + provider status fields.
ALTER TABLE public.communication_deliveries
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status text;

ALTER TABLE public.communication_delivery_attempts
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status text;

-- 4. A provider message id identifies exactly one attempt (idempotent callbacks,
--    and no cross-tenant ambiguity when matching a callback).
CREATE UNIQUE INDEX IF NOT EXISTS communication_delivery_attempts_provider_msg_uniq
  ON public.communication_delivery_attempts (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 5. Sweep index for accepted communications awaiting confirmation.
CREATE INDEX IF NOT EXISTS communication_deliveries_awaiting_conf_idx
  ON public.communication_deliveries (confirmation_due_at)
  WHERE delivery_status = 'accepted';