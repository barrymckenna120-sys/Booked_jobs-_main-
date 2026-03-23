CREATE OR REPLACE FUNCTION public.mark_quote_viewed(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE quotes
  SET status = 'viewed',
      viewed_at = now(),
      updated_at = now()
  WHERE id = p_quote_id
    AND status IN ('Sent', 'sent');
END;
$$;