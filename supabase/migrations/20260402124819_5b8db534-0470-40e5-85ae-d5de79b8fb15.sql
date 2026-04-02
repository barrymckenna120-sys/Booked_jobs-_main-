
CREATE OR REPLACE FUNCTION public.get_cert_pdf(p_cert_number text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object('pdf_url', c.pdf_url)
  FROM certificates c
  WHERE c.cert_number = p_cert_number
  LIMIT 1;
$$;
