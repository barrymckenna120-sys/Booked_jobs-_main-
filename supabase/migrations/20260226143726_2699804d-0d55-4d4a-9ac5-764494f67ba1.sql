
ALTER TABLE public.engineers 
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'engineer',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS last_login text;
