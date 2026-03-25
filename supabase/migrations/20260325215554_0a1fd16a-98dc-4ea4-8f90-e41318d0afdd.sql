
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
  v_description text;
  v_customer_id uuid;
  v_orig_job_type text;
  v_orig_engineer text;
  v_orig_engineer_id uuid;
  v_new_job_id uuid;
  v_converted_job_id uuid;
  v_total_amount numeric;
  v_quote_number text;
  v_deposit numeric;
  v_deposit_amount numeric;
  v_balance_due numeric;
  v_payment_link text;
  v_effective_deposit numeric;
  v_recipient record;
BEGIN
  SELECT q.status, q.job_id, q.user_id, c.name, q.description, q.customer_id, q.converted_job_id, q.total_amount, q.quote_number, COALESCE(q.deposit, q.deposit_amount, 0), q.deposit_amount, q.deposit, q.balance_due, q.payment_link
  INTO v_current_status, v_job_id, v_user_id, v_customer_name, v_description, v_customer_id, v_converted_job_id, v_total_amount, v_quote_number, v_deposit, v_deposit_amount, v_effective_deposit, v_balance_due, v_payment_link
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  WHERE q.id = p_quote_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_current_status NOT IN ('Sent', 'sent', 'Draft', 'draft', 'viewed') THEN
    RAISE EXCEPTION 'Quote has already been responded to';
  END IF;

  v_quote_ref := COALESCE(v_quote_number, 'Q-' || upper(left(p_quote_id::text, 4)));

  -- Resolve the effective deposit: prefer deposit_amount, fall back to deposit
  v_effective_deposit := COALESCE(NULLIF(v_deposit_amount, 0), v_effective_deposit, 0);

  IF p_accepted THEN
    IF v_converted_job_id IS NULL THEN
      SELECT job_type, assigned_engineer, assigned_engineer_id
      INTO v_orig_job_type, v_orig_engineer, v_orig_engineer_id
      FROM service_calls WHERE id = v_job_id;

      INSERT INTO service_calls (customer_id, user_id, job_type, job_issue, assigned_engineer, assigned_engineer_id, status, has_quote, notes, source, revenue, deposit_amount, balance_due, deposit_required, deposit_paid, payment_link)
      VALUES (v_customer_id, v_user_id, COALESCE(v_orig_job_type, 'Repair'), v_description, v_orig_engineer, v_orig_engineer_id, 'incoming', true, 'Created from accepted quote ' || v_quote_ref, 'Quote', v_total_amount, v_effective_deposit, v_balance_due, (v_effective_deposit > 0), false, v_payment_link)
      RETURNING id INTO v_new_job_id;

      UPDATE quotes SET status = 'converted', accepted_at = now(), converted_job_id = v_new_job_id, updated_at = now() WHERE id = p_quote_id;
    ELSE
      UPDATE quotes SET status = 'converted', accepted_at = now(), updated_at = now() WHERE id = p_quote_id;
      v_new_job_id := v_converted_job_id;
    END IF;

    INSERT INTO notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (
      v_user_id,
      'quote_accepted',
      'New Incoming Job',
      'Quote ' || v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer') || '. New incoming job ready to schedule. Total: ' || chr(8364) || TRIM(TO_CHAR(v_total_amount, 'FM999,999.00')),
      v_new_job_id,
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_ref, 'quote_id', p_quote_id, 'total_amount', v_total_amount, 'deposit', v_effective_deposit)
    );

    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM engineers
      WHERE user_id = v_user_id AND role IN ('admin', 'office') AND auth_user_id IS NOT NULL AND auth_user_id != v_user_id
    LOOP
      INSERT INTO notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (
        v_recipient.auth_user_id,
        'quote_accepted',
        'New Incoming Job',
        'Quote ' || v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer') || '. New incoming job ready to schedule. Total: ' || chr(8364) || TRIM(TO_CHAR(v_total_amount, 'FM999,999.00')),
        v_new_job_id,
        'office',
        jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_ref, 'quote_id', p_quote_id, 'total_amount', v_total_amount, 'deposit', v_effective_deposit)
      );
    END LOOP;

    INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata)
    VALUES (
      v_user_id,
      COALESCE(v_customer_name, 'Customer'),
      'customer',
      'quote_accepted',
      'quote',
      p_quote_id::text,
      v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer'),
      jsonb_build_object('job_id', v_job_id, 'customer_name', v_customer_name, 'converted_job_id', v_new_job_id)
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
