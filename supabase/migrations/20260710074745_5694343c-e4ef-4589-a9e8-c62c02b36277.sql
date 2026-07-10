ALTER TABLE public.hazard_notifications
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS hazard_notifications_access_token_key
  ON public.hazard_notifications(access_token);