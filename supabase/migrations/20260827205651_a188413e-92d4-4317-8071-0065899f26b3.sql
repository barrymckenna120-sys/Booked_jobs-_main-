DROP FUNCTION IF EXISTS public.expire_overdue_quotes();

CREATE OR REPLACE FUNCTION public.expire_overdue_quotes(p_organisation_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.quotes
  SET status = 'expired', updated_at = now()
  WHERE expiry_date < CURRENT_DATE
    AND status IN ('Sent', 'sent', 'viewed')
    AND (p_organisation_id IS NULL OR organisation_id = p_organisation_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_quotes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_overdue_quotes(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.expire_overdue_quotes(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_quotes(uuid) TO service_role;