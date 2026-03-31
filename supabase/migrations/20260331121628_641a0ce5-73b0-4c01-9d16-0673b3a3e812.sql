
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage categories"
  ON public.categories
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed with existing hardcoded categories
INSERT INTO public.categories (name) VALUES
  ('Boilers'), ('Heat Pumps'), ('Heat Controls'), ('WiFi & App Units'), ('Parts'), ('Labour'), ('Materials');
