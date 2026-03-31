
DO $$
DECLARE
  kn_org_id UUID;
BEGIN
  SELECT id INTO kn_org_id FROM public.organisations WHERE slug = 'kn-gas-services';

  EXECUTE format('ALTER TABLE public.service_calls ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.customers ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.engineers ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.quotes ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.settings ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.notifications ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.audit_log ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.whatsapp_messages ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.certificates ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.cert2_certificates ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.job_media ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.job_messages ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.hazard_notifications ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.profiles ALTER COLUMN organisation_id SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.brand_settings ALTER COLUMN organisation_id_ref SET DEFAULT %L', kn_org_id);
  EXECUTE format('ALTER TABLE public.message_log ALTER COLUMN organisation_id_ref SET DEFAULT %L', kn_org_id);
END $$;
