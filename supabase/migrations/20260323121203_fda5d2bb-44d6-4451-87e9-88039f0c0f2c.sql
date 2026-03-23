
CREATE OR REPLACE FUNCTION public.get_quote_public(p_quote_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'job_id', q.job_id,
      'expiry_date', q.expiry_date,
      'discount', q.discount,
      'vat_enabled', q.vat_enabled,
      'balance_due', q.balance_due,
      'quote_number', q.quote_number,
      'notes', q.notes,
      'job_type', q.job_type,
      'pdf_url', q.pdf_url
    ),
    'customer_name', c.name,
    'customer_address', c.address,
    'customer_phone', c.phone,
    'business_name', COALESCE(s.business_name, 'BookedJobs'),
    'business_phone', s.business_phone,
    'business_address', s.business_address,
    'rgi_number', s.rgi_number,
    'whatsapp_number', s.whatsapp_number,
    'logo_url', s.logo_url,
    'line_items', COALESCE((
      SELECT json_agg(json_build_object(
        'description', li.description,
        'qty', li.qty,
        'unit_price', li.unit_price,
        'line_total', li.line_total
      ) ORDER BY li.sort_order, li.created_at)
      FROM quote_line_items li WHERE li.quote_id = q.id
    ), '[]'::json)
  )
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  LEFT JOIN settings s ON s.user_id = q.user_id
  WHERE q.id = p_quote_id
  LIMIT 1;
$function$
