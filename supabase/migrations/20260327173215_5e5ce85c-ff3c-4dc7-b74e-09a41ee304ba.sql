
-- Hazard notifications table
CREATE TABLE public.hazard_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.service_calls(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ref_number text,
  hazard_types jsonb DEFAULT '[]'::jsonb,
  gas_type text DEFAULT 'natural_gas',
  gas_supplier text,
  appliance text,
  make text,
  model text,
  location text,
  isolation_reasons text,
  pressure_reading text,
  meter_number text,
  meter_reading text,
  isolation_notes text,
  gas_isolated_to_premises boolean,
  customer_sig_url text,
  engineer_sig_url text,
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hazard_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as certificates)
CREATE POLICY "Users can insert own hazard notifications" ON public.hazard_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (job_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid()))
    OR (job_id IN (SELECT id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid())))
  );

CREATE POLICY "Users can select own hazard notifications" ON public.hazard_notifications
  FOR SELECT TO authenticated
  USING (
    (job_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid()))
    OR (job_id IN (SELECT id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid())))
  );

CREATE POLICY "Users can update own hazard notifications" ON public.hazard_notifications
  FOR UPDATE TO authenticated
  USING (
    (job_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid()))
    OR (job_id IN (SELECT id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid())))
  )
  WITH CHECK (
    (job_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid()))
    OR (job_id IN (SELECT id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid())))
  );

CREATE POLICY "Service role full access hazard_notifications" ON public.hazard_notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
