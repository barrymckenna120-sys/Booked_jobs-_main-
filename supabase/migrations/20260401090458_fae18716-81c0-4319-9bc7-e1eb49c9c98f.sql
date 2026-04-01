
ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS invoice_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_reminder_2_sent_at timestamptz;
