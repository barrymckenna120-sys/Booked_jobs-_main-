CREATE OR REPLACE FUNCTION public.get_receipt_public(p_receipt_number text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'receipt_number', sc.receipt_number,
    'job_reference', sc.job_reference,
    'job_type', sc.job_type,
    'scheduled_date', sc.scheduled_date,
    'completed_at', sc.completed_at,
    'payment_method', sc.payment_method,
    'revenue', sc.revenue,
    'receipt_pdf_url', sc.receipt_pdf_url,
    'customer_name', c.name,
    'customer_address', c.address,
    'customer_eircode', c.eircode,
    'business_name', COALESCE(s.business_name, ''),
    'business_phone', s.business_phone,
    'business_address', s.business_address,
    'rgi_number', s.rgi_number,
    'logo_url', s.logo_url
  )
  FROM service_calls sc
  LEFT JOIN customers c ON c.id = sc.customer_id
  LEFT JOIN settings s ON s.user_id = sc.user_id
  WHERE sc.receipt_number = p_receipt_number
  LIMIT 1;
$$;