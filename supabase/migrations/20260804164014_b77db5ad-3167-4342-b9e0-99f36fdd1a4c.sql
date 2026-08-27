ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS reminder_14_days_sent boolean NOT NULL DEFAULT false;