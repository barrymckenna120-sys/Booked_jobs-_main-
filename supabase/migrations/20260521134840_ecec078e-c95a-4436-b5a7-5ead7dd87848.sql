CREATE TABLE public.booking_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  full_url text NOT NULL,
  customer_id uuid,
  organisation_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_booking_links_token ON public.booking_links(token);

ALTER TABLE public.booking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_links_select_org"
ON public.booking_links FOR SELECT
TO authenticated
USING (organisation_id = get_my_org_id());

CREATE POLICY "booking_links_insert_org"
ON public.booking_links FOR INSERT
TO authenticated
WITH CHECK (organisation_id = get_my_org_id());

CREATE POLICY "booking_links_public_lookup"
ON public.booking_links FOR SELECT
TO anon
USING (expires_at > now());

CREATE POLICY "booking_links_service_role_all"
ON public.booking_links FOR ALL
TO service_role
USING (true)
WITH CHECK (true);