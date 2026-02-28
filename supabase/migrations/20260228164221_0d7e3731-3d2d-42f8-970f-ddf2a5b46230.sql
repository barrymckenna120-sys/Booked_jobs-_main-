CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_accepted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id uuid;
  v_current_status text;
  v_customer_name text;
  v_user_id uuid;
  v_quote_ref text;
BEGIN
  -- Get current quote status, job_id, and owner
  SELECT q.status, q.job_id, q.user_id, c.name
  INTO v_current_status, v_job_id, v_user_id, v_customer_name
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  WHERE q.id = p_quote_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_current_status NOT IN ('Sent', 'Draft') THEN
    RAISE EXCEPTION 'Quote has already been responded to';
  END IF;

  v_quote_ref := 'Q-' || upper(left(p_quote_id::text, 4));

  IF p_accepted THEN
    UPDATE quotes SET status = 'Accepted', accepted_at = now(), updated_at = now() WHERE id = p_quote_id;
    UPDATE service_calls SET status = 'Awaiting Deposit', updated_at = now() WHERE id = v_job_id;

    INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata)
    VALUES (
      v_user_id,
      COALESCE(v_customer_name, 'Customer'),
      'customer',
      'quote_accepted',
      'quote',
      p_quote_id::text,
      v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer'),
      jsonb_build_object('job_id', v_job_id, 'customer_name', v_customer_name)
    );
  ELSE
    UPDATE quotes SET status = 'Rejected', updated_at = now() WHERE id = p_quote_id;

    INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata)
    VALUES (
      v_user_id,
      COALESCE(v_customer_name, 'Customer'),
      'customer',
      'quote_declined',
      'quote',
      p_quote_id::text,
      v_quote_ref || ' declined by ' || COALESCE(v_customer_name, 'Customer'),
      jsonb_build_object('job_id', v_job_id, 'customer_name', v_customer_name)
    );
  END IF;
END;
$function$;