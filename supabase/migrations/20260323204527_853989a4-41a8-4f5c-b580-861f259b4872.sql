
-- 1. job_tags table
CREATE TABLE public.job_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  colour text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read job_tags"
  ON public.job_tags FOR SELECT TO authenticated
  USING (true);

-- 2. service_call_tags junction table
CREATE TABLE public.service_call_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id uuid NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.job_tags(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_call_id, tag_id)
);

ALTER TABLE public.service_call_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read service_call_tags"
  ON public.service_call_tags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert service_call_tags"
  ON public.service_call_tags FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete service_call_tags"
  ON public.service_call_tags FOR DELETE TO authenticated
  USING (true);

-- 3. Seed job_tags
INSERT INTO public.job_tags (name, colour) VALUES
  ('New Fitted', '#4A86E8'),
  ('Needs New Soon', '#F59E0B'),
  ('Under Warranty', '#10B981');
