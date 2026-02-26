
CREATE OR REPLACE FUNCTION public.get_quote_public(p_quote_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'quote', json_build_object(
      'id', q.id,
      'description', q.description,
      'parts_cost', q.parts_cost,
      'labour_cost', q.labour_cost,
      'callout_cost', q.callout_cost,
      'total_amount', q.total_amount,
      'status', q.status,
      'payment_link', q.payment_link,
      'deposit_amount', q.deposit_amount,
      'created_at', q.created_at,
      'customer_id', q.customer_id,
      'job_id', q.job_id
    ),
    'customer_name', c.name,
    'customer_address', c.address,
    'business_name', COALESCE(s.business_name, 'BookedJobs'),
    'business_phone', s.business_phone,
    'whatsapp_number', s.whatsapp_number,
    'logo_url', s.logo_url
  )
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  LEFT JOIN settings s ON s.user_id = q.user_id
  WHERE q.id = p_quote_id
  LIMIT 1;
$$;
