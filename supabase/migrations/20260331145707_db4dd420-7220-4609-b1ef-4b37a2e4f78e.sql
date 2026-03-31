
-- Step 1: Create organisations table
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  stripe_customer_id TEXT,
  owner_user_id UUID
);

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_owner_select" ON public.organisations
  FOR SELECT USING (owner_user_id = auth.uid());

CREATE POLICY "org_owner_update" ON public.organisations
  FOR UPDATE USING (owner_user_id = auth.uid());

-- Step 3: Add organisation_id to all core tables
ALTER TABLE public.service_calls ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.customers ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.engineers ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.quotes ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.notifications ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.audit_log ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.settings ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.whatsapp_messages ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.certificates ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.cert2_certificates ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.job_media ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.job_messages ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.hazard_notifications ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.profiles ADD COLUMN organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.brand_settings ADD COLUMN organisation_id_ref UUID REFERENCES public.organisations(id);
ALTER TABLE public.message_log ADD COLUMN organisation_id_ref UUID REFERENCES public.organisations(id);
