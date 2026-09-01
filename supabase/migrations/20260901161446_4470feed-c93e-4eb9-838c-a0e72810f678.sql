ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_job_id uuid NULL REFERENCES public.service_calls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS service_calls_dupe_lookup_idx
  ON public.service_calls (organisation_id, job_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalise_phone_e164(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN ''
    WHEN btrim(regexp_replace(raw, '[[:space:]\-()]', '', 'g')) = '' THEN ''
    WHEN btrim(regexp_replace(raw, '[[:space:]\-()]', '', 'g')) LIKE '+%'
      THEN btrim(regexp_replace(raw, '[[:space:]\-()]', '', 'g'))
    WHEN btrim(regexp_replace(raw, '[[:space:]\-()]', '', 'g')) LIKE '353%'
      THEN '+' || btrim(regexp_replace(raw, '[[:space:]\-()]', '', 'g'))
    ELSE '+353' || regexp_replace(btrim(regexp_replace(raw, '[[:space:]\-()]', '', 'g')), '^0', '')
  END
$$;

CREATE OR REPLACE FUNCTION public.find_duplicate_job(
  p_organisation_id uuid,
  p_phone text,
  p_job_type text,
  p_address text,
  p_window_minutes integer DEFAULT 60,
  p_exclude_service_call_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  job_reference text,
  job_type text,
  address text,
  customer_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_job(uuid, text, text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_job(uuid, text, text, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_job(uuid, text, text, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalise_phone_e164(text) TO authenticated, service_role;