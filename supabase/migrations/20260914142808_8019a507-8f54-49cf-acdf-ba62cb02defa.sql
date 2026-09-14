ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_quote_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_org_quote_number_key
  ON public.quotes (organisation_id, quote_number);