CREATE OR REPLACE FUNCTION public.expire_overdue_quotes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE quotes
  SET status = 'expired', updated_at = now()
  WHERE expiry_date < CURRENT_DATE
    AND status IN ('Sent', 'sent', 'viewed');
END;
$$;