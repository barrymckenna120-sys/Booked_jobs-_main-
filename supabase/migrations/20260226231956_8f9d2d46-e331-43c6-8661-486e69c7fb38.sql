
-- Add renewal_stage column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS renewal_stage text NOT NULL DEFAULT 'not_contacted';

-- Backfill existing data based on current state:
-- If they have a scheduled_service_date → 'booked'
-- If they have last_reminder_sent → 'reminded'
-- Otherwise → 'not_contacted'
UPDATE public.customers 
SET renewal_stage = CASE
  WHEN scheduled_service_date IS NOT NULL THEN 'booked'
  WHEN last_reminder_sent IS NOT NULL THEN 'reminded'
  ELSE 'not_contacted'
END
WHERE next_service_due IS NOT NULL;
