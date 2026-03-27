
CREATE TABLE public.cert2_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id uuid REFERENCES public.service_calls(id) ON DELETE CASCADE NOT NULL,
  engineer_id uuid REFERENCES public.engineers(id) NOT NULL,
  cert_type text NOT NULL DEFAULT 'gas_installation',
  serial_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  pdf_url text,

  -- Part I: Premises & Owner
  gprn text,
  eircode_premises text,
  address_premises text,
  customer_name_premises text,
  tel_premises text,
  gas_type text,
  install_type text,
  owner_eircode text,
  owner_address text,
  owner_name text,
  owner_tel text,

  -- Appliances
  central_heating boolean DEFAULT false,
  fire_open boolean DEFAULT false,
  fire_flueless boolean DEFAULT false,
  fire_r_seal boolean DEFAULT false,
  cooker boolean DEFAULT false,
  hob boolean DEFAULT false,
  other_appliance text,
  pipework_material text,
  appliance_location_correct boolean DEFAULT false,
  adequate_ventilation boolean DEFAULT false,
  flue_inspected boolean DEFAULT false,
  soundness_test_pass boolean DEFAULT false,

  -- Part II: Commissioning
  co_reading text,
  co2_reading text,
  coco2_ratio text,
  commissioning_date date,

  -- Signatures & RGI
  rgi_number text,
  issue_date date,
  status text NOT NULL DEFAULT 'draft'
);

ALTER TABLE public.cert2_certificates ENABLE ROW LEVEL SECURITY;

-- Engineers can insert their own certs
CREATE POLICY "Engineers can insert cert2"
ON public.cert2_certificates FOR INSERT TO authenticated
WITH CHECK (
  engineer_id = get_engineer_id(auth.uid())
  OR service_call_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid())
);

-- Engineers and owners can view
CREATE POLICY "Users can view cert2"
ON public.cert2_certificates FOR SELECT TO authenticated
USING (
  engineer_id = get_engineer_id(auth.uid())
  OR service_call_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid())
);

-- Engineers and owners can update
CREATE POLICY "Users can update cert2"
ON public.cert2_certificates FOR UPDATE TO authenticated
USING (
  engineer_id = get_engineer_id(auth.uid())
  OR service_call_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid())
);

-- Service role full access
CREATE POLICY "Service role full access cert2"
ON public.cert2_certificates FOR ALL TO service_role
USING (true) WITH CHECK (true);
