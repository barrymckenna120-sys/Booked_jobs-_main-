
-- Engineer working days (which days each engineer works)
CREATE TABLE public.engineer_working_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engineer_id uuid NOT NULL REFERENCES public.engineers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(engineer_id, day_of_week)
);

-- Engineer blocked slots (block a specific date + optional time block)
CREATE TABLE public.engineer_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engineer_id uuid NOT NULL REFERENCES public.engineers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  block_type text NOT NULL DEFAULT 'slot' CHECK (block_type IN ('slot', 'holiday')),
  block_date date NOT NULL,
  end_date date,
  time_block text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for engineer_working_days
ALTER TABLE public.engineer_working_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own engineer working days" ON public.engineer_working_days FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own engineer working days" ON public.engineer_working_days FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own engineer working days" ON public.engineer_working_days FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own engineer working days" ON public.engineer_working_days FOR DELETE USING (auth.uid() = user_id);

-- RLS for engineer_blocks
ALTER TABLE public.engineer_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own engineer blocks" ON public.engineer_blocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own engineer blocks" ON public.engineer_blocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own engineer blocks" ON public.engineer_blocks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own engineer blocks" ON public.engineer_blocks FOR DELETE USING (auth.uid() = user_id);
