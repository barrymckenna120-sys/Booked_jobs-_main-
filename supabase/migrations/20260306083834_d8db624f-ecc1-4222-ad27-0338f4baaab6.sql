
-- Create customer_call_notes table
CREATE TABLE public.customer_call_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.customer_call_notes ENABLE ROW LEVEL SECURITY;

-- Admin/office full access (using existing get_user_role function)
CREATE POLICY "office_full_access" ON public.customer_call_notes
FOR ALL TO authenticated
USING (get_user_role(auth.uid()) IN ('admin', 'office'))
WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'office'));

-- Engineers can read notes for their assigned customers
CREATE POLICY "engineer_read_notes" ON public.customer_call_notes
FOR SELECT TO authenticated
USING (
  get_user_role(auth.uid()) = 'engineer'
  AND customer_id IN (
    SELECT customer_id FROM public.service_calls
    WHERE assigned_engineer_id = get_engineer_id(auth.uid())
  )
);
