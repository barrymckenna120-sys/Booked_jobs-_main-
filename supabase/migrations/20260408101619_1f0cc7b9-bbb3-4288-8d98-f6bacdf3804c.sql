
-- Create boiler_brands table
CREATE TABLE public.boiler_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name text NOT NULL UNIQUE,
  warranty_years integer NOT NULL,
  organisation_id uuid REFERENCES public.organisations(id) DEFAULT '8c37827f-ce2c-4507-a821-a5e807d89856'::uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.boiler_brands ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read boiler_brands"
ON public.boiler_brands FOR SELECT
TO authenticated
USING (true);

-- Only admin/office can insert
CREATE POLICY "Admin/office can insert boiler_brands"
ON public.boiler_brands FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'office'));

-- Only admin/office can update
CREATE POLICY "Admin/office can update boiler_brands"
ON public.boiler_brands FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) IN ('admin', 'office'));

-- Only admin/office can delete
CREATE POLICY "Admin/office can delete boiler_brands"
ON public.boiler_brands FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) IN ('admin', 'office'));

-- Add warranty_reminder_log to customers table
ALTER TABLE public.customers
ADD COLUMN warranty_reminder_log jsonb DEFAULT '[]'::jsonb;
