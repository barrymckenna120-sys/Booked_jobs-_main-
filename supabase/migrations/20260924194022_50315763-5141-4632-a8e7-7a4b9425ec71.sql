ALTER TABLE public.boiler_fault_codes
  ADD COLUMN category text NOT NULL DEFAULT 'fault' CHECK (category IN ('fault','status'));