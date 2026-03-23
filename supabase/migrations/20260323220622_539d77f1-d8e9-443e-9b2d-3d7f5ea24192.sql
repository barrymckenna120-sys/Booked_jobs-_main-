
CREATE OR REPLACE FUNCTION public.get_quote_by_number(p_quote_number text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'quote_id', q.id
  )
  FROM quotes q
  WHERE q.quote_number = p_quote_number
  LIMIT 1;
$$;
