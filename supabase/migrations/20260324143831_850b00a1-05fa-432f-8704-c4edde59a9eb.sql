
CREATE TABLE public.brand_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id text NOT NULL,
  primary_color text NOT NULL DEFAULT '#1E3A5F',
  secondary_color text NOT NULL DEFAULT '#2C4F7C',
  accent_color text NOT NULL DEFAULT '#4A86E8',
  background_color text NOT NULL DEFAULT '#FFFFFF',
  header_text_color text NOT NULL DEFAULT '#FFFFFF',
  body_text_color text NOT NULL DEFAULT '#1F2937',
  section_label_color text NOT NULL DEFAULT '#1E3A5F',
  border_color text NOT NULL DEFAULT '#E2E8F0',
  table_header_color text NOT NULL DEFAULT '#EBF2FF',
  table_row_color text NOT NULL DEFAULT '#FFFFFF',
  table_alt_color text NOT NULL DEFAULT '#F8FAFF',
  font_family text NOT NULL DEFAULT 'Poppins',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id)
);

ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read brand_settings"
  ON public.brand_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert brand_settings"
  ON public.brand_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update brand_settings"
  ON public.brand_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
