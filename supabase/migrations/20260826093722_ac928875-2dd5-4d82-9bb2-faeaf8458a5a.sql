CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_accepted boolean, p_access_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE;
  v_caller_role text;
  v_customer_name text;
  v_customer_org uuid;
  v_organisation_id uuid;
  v_quote_ref text;
  v_effective_deposit numeric;
  v_orig_job_type text;
  v_orig_engineer text;
  v_orig_engineer_id uuid;
  v_orig_org uuid;
  v_new_job_id uuid;
  v_recipient record;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_quote.access_token IS DISTINCT FROM p_access_token THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF v_quote.access_token_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_actioned');
  END IF;

  v_caller_role := current_setting('request.jwt.claim.role', true);

  IF v_caller_role = 'authenticated' THEN
    IF get_my_org_id() IS DISTINCT FROM v_quote.organisation_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;
  END IF;

  IF v_quote.status NOT IN ('Sent', 'sent', 'Draft', 'draft', 'viewed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT c.name, c.organisation_id
  INTO v_customer_name, v_customer_org
  FROM customers c WHERE c.id = v_quote.customer_id;

  v_organisation_id := COALESCE(v_quote.organisation_id, v_customer_org);
  v_quote_ref := COALESCE(v_quote.quote_number, 'Q-' || upper(left(p_quote_id::text, 4)));
  v_effective_deposit := COALESCE(NULLIF(v_quote.deposit_amount, 0), NULLIF(v_quote.deposit, 0), 0);

  IF NOT p_accepted THEN
    UPDATE quotes
    SET status = 'Rejected',
        access_token_used_at = now(),
        updated_at = now()
    WHERE id = p_quote_id;

    INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata, organisation_id)
    VALUES (
      v_quote.user_id,
      COALESCE(v_customer_name, 'Customer'),
      'customer',
      'quote_declined',
      'quote',
      p_quote_id::text,
      v_quote_ref || ' declined by ' || COALESCE(v_customer_name, 'Customer'),
      jsonb_build_object('job_id', v_quote.job_id, 'customer_name', v_customer_name),
      v_organisation_id
    );

    RETURN jsonb_build_object('success', true);
  END IF;

  -- Accepted: create the converted job unless one already exists.
  -- The new job starts with the FULL quote total outstanding. A quote's
  -- balance_due may be a post-deposit display value, but no deposit has been
  -- collected at acceptance time; the SumUp webhook reduces the balance only
  -- after the card payment is verified.
  IF v_quote.converted_job_id IS NULL THEN
    SELECT job_type, assigned_engineer, assigned_engineer_id, organisation_id
    INTO v_orig_job_type, v_orig_engineer, v_orig_engineer_id, v_orig_org
    FROM service_calls WHERE id = v_quote.job_id;

    v_organisation_id := COALESCE(v_orig_org, v_organisation_id);

    INSERT INTO service_calls (
      customer_id, user_id, job_type, job_issue, assigned_engineer, assigned_engineer_id,
      status, has_quote, notes, source, revenue, deposit_amount, balance_due,
      deposit_required, deposit_paid, payment_link, quote_id, organisation_id
    )
    VALUES (
      v_quote.customer_id,
      v_quote.user_id,
      COALESCE(NULLIF(v_quote.job_type, 'other'), v_orig_job_type, 'Repair'),
      v_quote.description,
      v_orig_engineer,
      v_orig_engineer_id,
      'incoming',
      true,
      'Created from accepted quote ' || v_quote_ref || E'\n\n' || COALESCE(v_quote.description, ''),
      'Quote',
      v_quote.total_amount,
      v_effective_deposit,
      COALESCE(v_quote.total_amount, 0),
      (v_effective_deposit > 0),
      false,
      v_quote.payment_link,
      p_quote_id,
      v_organisation_id
    )
    RETURNING id INTO v_new_job_id;
  ELSE
    v_new_job_id := v_quote.converted_job_id;
  END IF;

  UPDATE quotes
  SET status = 'converted',
      accepted_at = now(),
      converted_job_id = v_new_job_id,
      access_token_used_at = now(),
      updated_at = now()
  WHERE id = p_quote_id;

  INSERT INTO notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
  VALUES (
    v_quote.user_id,
    'quote_accepted',
    'New Incoming Job',
    'Quote ' || v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer') || '. New incoming job ready to schedule. Total: ' || chr(8364) || TRIM(TO_CHAR(v_quote.total_amount, 'FM999,999.00')),
    v_new_job_id,
    'office',
    jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_ref, 'quote_id', p_quote_id, 'total_amount', v_quote.total_amount, 'deposit', v_effective_deposit),
    v_organisation_id
  );

  FOR v_recipient IN
    SELECT DISTINCT auth_user_id FROM engineers
    WHERE organisation_id = v_organisation_id
      AND role IN ('admin', 'office', 'owner')
      AND status = 'active'
      AND auth_user_id IS NOT NULL
      AND auth_user_id IS DISTINCT FROM v_quote.user_id
  LOOP
    INSERT INTO notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
    VALUES (
      v_recipient.auth_user_id,
      'quote_accepted',
      'New Incoming Job',
      'Quote ' || v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer') || '. New incoming job ready to schedule. Total: ' || chr(8364) || TRIM(TO_CHAR(v_quote.total_amount, 'FM999,999.00')),
      v_new_job_id,
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_ref, 'quote_id', p_quote_id, 'total_amount', v_quote.total_amount, 'deposit', v_effective_deposit),
      v_organisation_id
    );
  END LOOP;

  INSERT INTO audit_log (user_id, user_name, user_role, action_type, entity_type, entity_id, detail, metadata, organisation_id)
  VALUES (
    v_quote.user_id,
    COALESCE(v_customer_name, 'Customer'),
    'customer',
    'quote_accepted',
    'quote',
    p_quote_id::text,
    v_quote_ref || ' accepted by ' || COALESCE(v_customer_name, 'Customer'),
    jsonb_build_object('job_id', v_quote.job_id, 'customer_name', v_customer_name, 'converted_job_id', v_new_job_id),
    v_organisation_id
  );

  RETURN jsonb_build_object('success', true, 'job_id', v_new_job_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.respond_to_quote(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_quote(uuid, boolean, uuid) TO anon, authenticated;