ALTER TABLE public.organisations ADD COLUMN whatsapp_test_mode boolean NOT NULL DEFAULT false;
ALTER TABLE public.organisations ALTER COLUMN whatsapp_test_mode SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.protect_whatsapp_test_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.whatsapp_test_mode IS DISTINCT FROM OLD.whatsapp_test_mode
     AND coalesce(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres','supabase_admin')
     AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a superadmin can change WhatsApp test mode' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_whatsapp_test_mode
BEFORE UPDATE ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.protect_whatsapp_test_mode();

CREATE TABLE public.organisation_whatsapp_allowed_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  phone text NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_whatsapp_allowed_numbers TO authenticated;
GRANT ALL ON public.organisation_whatsapp_allowed_numbers TO service_role;
ALTER TABLE public.organisation_whatsapp_allowed_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage WhatsApp allowed numbers"
ON public.organisation_whatsapp_allowed_numbers FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));