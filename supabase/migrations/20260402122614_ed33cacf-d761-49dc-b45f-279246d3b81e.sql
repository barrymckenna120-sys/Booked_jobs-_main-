
-- Add job_reference column
ALTER TABLE public.service_calls ADD COLUMN job_reference text;

-- Backfill existing jobs with sequential KN numbers ordered by created_at
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.service_calls
)
UPDATE public.service_calls sc
SET job_reference = 'KN-' || LPAD(n.rn::text, 3, '0')
FROM numbered n
WHERE sc.id = n.id;

-- Create a sequence starting after the current max
DO $$
DECLARE
  max_num INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(REPLACE(job_reference, 'KN-', '') AS INT)
  ), 0) INTO max_num FROM public.service_calls WHERE job_reference IS NOT NULL;
  
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS job_reference_seq START WITH %s', max_num + 1);
END $$;

-- Create function to auto-assign job_reference on insert
CREATE OR REPLACE FUNCTION public.generate_job_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.job_reference IS NULL THEN
    NEW.job_reference := 'KN-' || LPAD(nextval('job_reference_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER set_job_reference
BEFORE INSERT ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION public.generate_job_reference();
