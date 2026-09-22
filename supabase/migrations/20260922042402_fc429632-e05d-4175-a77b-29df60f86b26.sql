-- Office/admin access helper, mirroring the app's role resolution
CREATE OR REPLACE FUNCTION public.has_office_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = _user_id AND role IN ('superadmin', 'admin', 'office')
    )
    OR EXISTS (
      SELECT 1 FROM public.engineers
      WHERE auth_user_id = _user_id
        AND (
          role IN ('owner', 'manager', 'admin', 'office')
          OR (role = 'engineer' AND can_access_office IS TRUE)
        )
    );
$$;

CREATE TABLE public.boiler_enquiries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  enquiry_type text NOT NULL DEFAULT 'new_boiler',
  status text NOT NULL DEFAULT 'NEW',
  assigned_to uuid,

  -- property
  property_type text,
  bedrooms text,
  floor_area text,
  address text,
  eircode text,

  -- existing heating
  current_heating text,
  existing_gas_connection text,
  existing_boiler_age text,
  existing_boiler_location text,
  boiler_relocation_required text,
  preferred_new_location text,

  -- heating system
  radiator_count text,
  radiator_age text,
  rooms_hard_to_heat text,
  rooms_hard_to_heat_notes text,
  existing_water_pump text,

  -- hot water
  bathroom_count text,
  hot_water_outlets text,
  simultaneous_hot_water_usage text,
  water_pressure text,
  poor_hot_water_flow text,
  hot_water_cylinder text,
  cylinder_location text,

  -- preferences
  purchase_priority text,
  installation_timeframe text,

  -- interested extras
  interested_radiators boolean,
  interested_smart_controls boolean,
  interested_heating_zones boolean,
  interested_system_flushing boolean,
  interested_water_pressure_improvement boolean,

  -- heat pump
  heat_pump_interest text,
  ber text,
  insulation_upgraded text,

  -- contact
  preferred_contact_method text,
  contact_name text,
  contact_phone text,
  contact_email text,

  -- attribution (never overwritten downstream)
  source text,
  landing_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,

  -- intake provenance
  external_source text,
  external_submission_id text,
  raw_payload jsonb,
  office_review_notes jsonb,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT boiler_enquiries_status_check CHECK (
    status IN ('NEW', 'CONTACTED', 'NEEDS_INFO', 'READY_TO_QUOTE', 'QUOTED', 'WON', 'LOST')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boiler_enquiries TO authenticated;
GRANT ALL ON public.boiler_enquiries TO service_role;

ALTER TABLE public.boiler_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boiler_enquiries_select" ON public.boiler_enquiries
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

CREATE POLICY "boiler_enquiries_insert" ON public.boiler_enquiries
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

CREATE POLICY "boiler_enquiries_update" ON public.boiler_enquiries
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()))
  WITH CHECK (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

CREATE POLICY "boiler_enquiries_delete" ON public.boiler_enquiries
  FOR DELETE TO authenticated
  USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

-- Idempotency for webhook retries
CREATE UNIQUE INDEX boiler_enquiries_external_submission_uniq
  ON public.boiler_enquiries (organisation_id, external_source, external_submission_id)
  WHERE external_submission_id IS NOT NULL;

CREATE INDEX boiler_enquiries_org_created_idx
  ON public.boiler_enquiries (organisation_id, created_at DESC);
CREATE INDEX boiler_enquiries_customer_idx
  ON public.boiler_enquiries (customer_id);

CREATE TRIGGER update_boiler_enquiries_updated_at
  BEFORE UPDATE ON public.boiler_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Additive links (nullable, no behaviour change to existing rows)
ALTER TABLE public.job_media
  ADD COLUMN boiler_enquiry_id uuid REFERENCES public.boiler_enquiries(id) ON DELETE CASCADE;
CREATE INDEX job_media_boiler_enquiry_idx ON public.job_media (boiler_enquiry_id);

ALTER TABLE public.quotes
  ADD COLUMN boiler_enquiry_id uuid REFERENCES public.boiler_enquiries(id) ON DELETE SET NULL;
CREATE INDEX quotes_boiler_enquiry_idx ON public.quotes (boiler_enquiry_id);