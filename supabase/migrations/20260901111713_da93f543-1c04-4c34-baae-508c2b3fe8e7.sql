CREATE INDEX IF NOT EXISTS customers_org_phone_idx ON public.customers (organisation_id, phone);
CREATE INDEX IF NOT EXISTS customers_org_gprn_idx ON public.customers (organisation_id, gprn);
CREATE INDEX IF NOT EXISTS customers_org_eircode_idx ON public.customers (organisation_id, eircode);