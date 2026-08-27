CREATE OR REPLACE FUNCTION public.mark_quote_viewed(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_customer_name text;
  v_quote_number text;
  v_total_amount numeric;
  v_recipient record;
BEGIN
  UPDATE quotes
  SET status = 'viewed',
      viewed_at = now(),
      updated_at = now()
  WHERE id = p_quote_id
    AND status IN ('Sent', 'sent');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT q.user_id, q.organisation_id, q.quote_number, q.total_amount, c.name
  INTO v_user_id, v_org_id, v_quote_number, v_total_amount, v_customer_name
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  WHERE q.id = p_quote_id;

  v_quote_number := COALESCE(v_quote_number, 'Q-' || upper(left(p_quote_id::text, 4)));
  v_customer_name := COALESCE(v_customer_name, 'Customer');

  INSERT INTO notifications (recipient_user_id, notification_type, title, body, role, metadata, organisation_id)
  VALUES (
    v_user_id,
    'message',
    '👀 Quote Viewed — ' || v_quote_number,
    v_customer_name || ' has opened ' || v_quote_number || '. Total: ' || chr(8364) || TRIM(TO_CHAR(v_total_amount, 'FM999,999.00')),
    'office',
    jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_number, 'quote_id', p_quote_id, 'total_amount', v_total_amount),
    v_org_id
  );

  FOR v_recipient IN
    SELECT DISTINCT auth_user_id FROM engineers
    WHERE organisation_id = v_org_id
      AND role IN ('admin', 'office', 'owner')
      AND status = 'active'
      AND auth_user_id IS NOT NULL
      AND auth_user_id != v_user_id
  LOOP
    INSERT INTO notifications (recipient_user_id, notification_type, title, body, role, metadata, organisation_id)
    VALUES (
      v_recipient.auth_user_id,
      'message',
      '👀 Quote Viewed — ' || v_quote_number,
      v_customer_name || ' has opened ' || v_quote_number || '. Total: ' || chr(8364) || TRIM(TO_CHAR(v_total_amount, 'FM999,999.00')),
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_number, 'quote_id', p_quote_id, 'total_amount', v_total_amount),
      v_org_id
    );
  END LOOP;
END;
$function$;