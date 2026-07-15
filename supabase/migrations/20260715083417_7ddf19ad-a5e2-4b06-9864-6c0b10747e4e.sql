CREATE UNIQUE INDEX IF NOT EXISTS service_calls_tally_submission_id_key
  ON public.service_calls (tally_submission_id)
  WHERE tally_submission_id IS NOT NULL;