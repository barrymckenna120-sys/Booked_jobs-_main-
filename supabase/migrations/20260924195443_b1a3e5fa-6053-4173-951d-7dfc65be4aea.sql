REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.find_duplicate_job(p_organisation_id uuid, p_phone text, p_job_type text, p_address text, p_window_minutes integer DEFAULT 60, p_exclude_service_call_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, job_reference text, job_type text, address text, customer_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
BEGIN
  IF v_role <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
    END IF;
    IF p_organisation_id IS DISTINCT FROM public.get_my_org_id() THEN
      RAISE EXCEPTION 'not authorised for this organisation' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT sc.id, sc.job_reference, sc.job_type, c.address, c.name, sc.created_at
  FROM public.service_calls sc
  JOIN public.customers c ON c.id = sc.customer_id
  WHERE p_organisation_id IS NOT NULL
    AND sc.organisation_id = p_organisation_id
    AND c.organisation_id = p_organisation_id
    AND public.normalise_phone_e164(p_phone) <> ''
    AND public.normalise_phone_e164(c.phone) = public.normalise_phone_e164(p_phone)
    AND sc.job_type = p_job_type
    AND btrim(coalesce(c.address, '')) = btrim(coalesce(p_address, ''))
    AND btrim(coalesce(p_address, '')) <> ''
    AND sc.created_at >= now() - make_interval(mins => greatest(coalesce(p_window_minutes, 60), 0))
    AND (p_exclude_service_call_id IS NULL OR sc.id <> p_exclude_service_call_id)
  ORDER BY sc.created_at DESC
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.find_duplicate_job(uuid, text, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_job(uuid, text, text, text, integer, uuid) TO authenticated, service_role;