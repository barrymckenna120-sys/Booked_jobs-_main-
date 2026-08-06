CREATE OR REPLACE FUNCTION public.is_ignored_number(_organisation_id uuid, _phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH key AS (
    SELECT CASE
      WHEN length(regexp_replace(coalesce(_phone, ''), '\D', '', 'g')) >= 9
        THEN right(regexp_replace(_phone, '\D', '', 'g'), 9)
      ELSE NULL
    END AS k
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_integrations ti
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(ti.config -> 'ignore_numbers') = 'array'
           THEN ti.config -> 'ignore_numbers'
           ELSE '[]'::jsonb END
    ) AS n(num)
    CROSS JOIN key
    WHERE ti.organisation_id = _organisation_id
      AND ti.integration_type = 'telnyx'
      AND key.k IS NOT NULL
      AND length(regexp_replace(n.num, '\D', '', 'g')) >= 9
      AND right(regexp_replace(n.num, '\D', '', 'g'), 9) = key.k
  );
$$;

REVOKE ALL ON FUNCTION public.is_ignored_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ignored_number(uuid, text) TO anon, authenticated, service_role;