ALTER TABLE public.message_log ADD COLUMN IF NOT EXISTS recipient_phone text;

CREATE INDEX IF NOT EXISTS message_log_recipient_phone_dedup_idx
  ON public.message_log (organisation_id, message_type, recipient_phone, sent_at)
  WHERE recipient_phone IS NOT NULL;