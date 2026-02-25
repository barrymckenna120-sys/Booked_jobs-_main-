
-- Add new columns to service_calls for incoming job data
ALTER TABLE service_calls
  ADD COLUMN IF NOT EXISTS boiler_brand TEXT,
  ADD COLUMN IF NOT EXISTS boiler_working BOOLEAN,
  ADD COLUMN IF NOT EXISTS boiler_issue TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Manual',
  ADD COLUMN IF NOT EXISTS incoming_status TEXT DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tally_submission_id TEXT;

-- Media attachments table
CREATE TABLE IF NOT EXISTS job_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES service_calls(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID,
  file_name TEXT NOT NULL,
  file_type TEXT,
  storage_path TEXT NOT NULL,
  storage_bucket TEXT DEFAULT 'job-media',
  public_url TEXT,
  uploaded_by TEXT DEFAULT 'customer',
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- RLS for job_media
ALTER TABLE job_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job media" ON job_media
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert job media" ON job_media
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update job media" ON job_media
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete job media" ON job_media
  FOR DELETE TO authenticated USING (true);

-- Anon can insert (for Tally webhook submissions)
CREATE POLICY "Anon can insert media records" ON job_media
  FOR INSERT TO anon WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_job_media_job_id ON job_media (job_id);

-- Storage bucket for job media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('job-media', 'job-media', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Anyone can upload job media" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'job-media');

CREATE POLICY "Anyone can view job media" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'job-media');

CREATE POLICY "Authenticated can delete job media" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'job-media');
