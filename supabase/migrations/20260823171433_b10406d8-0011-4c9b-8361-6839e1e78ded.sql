ALTER TABLE public.parts_request_comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'parts_request_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parts_request_comments;
  END IF;
END $$;