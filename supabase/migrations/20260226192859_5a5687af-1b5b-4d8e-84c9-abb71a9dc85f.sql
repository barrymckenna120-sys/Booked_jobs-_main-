
-- Drop the overly permissive policies
DROP POLICY IF EXISTS "anon_update_quote_status" ON public.quotes;
DROP POLICY IF EXISTS "anon_update_service_call_status" ON public.service_calls;

-- Create a secure function for accepting/declining quotes
CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_accepted boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_id uuid;
  v_current_status text;
BEGIN
  -- Get current quote status and job_id
  SELECT status, job_id INTO v_current_status, v_job_id
  FROM quotes WHERE id = p_quote_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Only allow response to Sent quotes
  IF v_current_status NOT IN ('Sent', 'Draft') THEN
    RAISE EXCEPTION 'Quote has already been responded to';
  END IF;

  IF p_accepted THEN
    UPDATE quotes SET status = 'Accepted', accepted_at = now(), updated_at = now() WHERE id = p_quote_id;
    UPDATE service_calls SET status = 'Awaiting Deposit', updated_at = now() WHERE id = v_job_id;
  ELSE
    UPDATE quotes SET status = 'Rejected', updated_at = now() WHERE id = p_quote_id;
  END IF;
END;
$$;
