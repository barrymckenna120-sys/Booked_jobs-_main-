
-- Create quick_replies table
CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own quick replies" ON public.quick_replies
  FOR SELECT TO public USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quick replies" ON public.quick_replies
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quick replies" ON public.quick_replies
  FOR UPDATE TO public USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quick replies" ON public.quick_replies
  FOR DELETE TO public USING (auth.uid() = user_id);

-- Also allow engineers to read quick replies owned by their employer (the admin who owns the engineer record)
CREATE POLICY "Engineers can read employer quick replies" ON public.quick_replies
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT e.user_id FROM public.engineers e WHERE e.auth_user_id = auth.uid()
    )
  );
