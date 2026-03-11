
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.onboarding_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tour_type text NOT NULL,
  rating integer,
  clarity boolean,
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.onboarding_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own feedback" ON public.onboarding_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own feedback" ON public.onboarding_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
