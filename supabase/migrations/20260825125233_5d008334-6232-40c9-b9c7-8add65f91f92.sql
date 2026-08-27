-- Count helper: per-area row counts for one organisation.
CREATE OR REPLACE FUNCTION public.count_org_data(_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'job_payments', (SELECT count(*) FROM public.job_payments WHERE organisation_id = _org_id),
    'payment_checkout_attempts', (SELECT count(*) FROM public.payment_checkout_attempts WHERE organisation_id = _org_id),
    'sumup_webhook_events', (SELECT count(*) FROM public.sumup_webhook_events WHERE organisation_id = _org_id),
    'invoice_line_items', (SELECT count(*) FROM public.invoice_line_items li WHERE li.invoice_id IN (SELECT id FROM public.invoices WHERE organisation_id = _org_id)),
    'invoices', (SELECT count(*) FROM public.invoices WHERE organisation_id = _org_id),
    'quote_line_items', (SELECT count(*) FROM public.quote_line_items qli WHERE qli.quote_id IN (SELECT id FROM public.quotes WHERE organisation_id = _org_id)),
    'quotes', (SELECT count(*) FROM public.quotes WHERE organisation_id = _org_id),
    'job_media', (SELECT count(*) FROM public.job_media WHERE organisation_id = _org_id),
    'job_messages', (SELECT count(*) FROM public.job_messages WHERE organisation_id = _org_id),
    'job_tags', (SELECT count(*) FROM public.job_tags WHERE organisation_id = _org_id),
    'service_call_tags', (SELECT count(*) FROM public.service_call_tags sct WHERE sct.service_call_id IN (SELECT id FROM public.service_calls WHERE organisation_id = _org_id)),
    'certificates', (SELECT count(*) FROM public.certificates WHERE organisation_id = _org_id),
    'cert2_certificates', (SELECT count(*) FROM public.cert2_certificates WHERE organisation_id = _org_id),
    'hazard_notifications', (SELECT count(*) FROM public.hazard_notifications WHERE organisation_id = _org_id),
    'parts_request_comments', (SELECT count(*) FROM public.parts_request_comments prc WHERE prc.parts_request_id IN (SELECT id FROM public.parts_requests WHERE organisation_id = _org_id)),
    'parts_requests', (SELECT count(*) FROM public.parts_requests WHERE organisation_id = _org_id),
    'transactions', (SELECT count(*) FROM public.transactions WHERE organisation_id = _org_id),
    'service_calls', (SELECT count(*) FROM public.service_calls WHERE organisation_id = _org_id),
    'customer_activity', (SELECT count(*) FROM public.customer_activity WHERE organisation_id = _org_id),
    'customer_call_notes', (SELECT count(*) FROM public.customer_call_notes ccn WHERE ccn.customer_id IN (SELECT id FROM public.customers WHERE organisation_id = _org_id)),
    'booking_links', (SELECT count(*) FROM public.booking_links WHERE organisation_id = _org_id),
    'customers', (SELECT count(*) FROM public.customers WHERE organisation_id = _org_id),
    'message_log', (SELECT count(*) FROM public.message_log WHERE organisation_id = _org_id),
    'whatsapp_messages', (SELECT count(*) FROM public.whatsapp_messages WHERE organisation_id = _org_id),
    'conversations', (SELECT count(*) FROM public.conversations WHERE organisation_id = _org_id),
    'notifications', (SELECT count(*) FROM public.notifications WHERE organisation_id = _org_id),
    'audit_log', (SELECT count(*) FROM public.audit_log WHERE organisation_id = _org_id AND action_type <> 'org_data_reset'),
    'tenant_activity_log', (SELECT count(*) FROM public.tenant_activity_log WHERE organisation_id = _org_id)
  );
$$;

REVOKE ALL ON FUNCTION public.count_org_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_org_data(uuid) TO service_role;

-- Destructive reset. Single transaction (one function call = one transaction).
CREATE OR REPLACE FUNCTION public.reset_org_data(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_test boolean;
  _counts jsonb := '{}'::jsonb;
  _media jsonb := '[]'::jsonb;
  n bigint;
BEGIN
  SELECT is_test INTO _is_test FROM public.organisations WHERE id = _org_id;

  IF _is_test IS NULL THEN
    RAISE EXCEPTION 'ORG_NOT_FOUND';
  END IF;

  IF _is_test IS NOT TRUE THEN
    RAISE EXCEPTION 'NOT_TEST_ORG';
  END IF;

  -- Capture media locations before the rows disappear.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', storage_bucket,
           'path', storage_path,
           'public_url', public_url
         )), '[]'::jsonb)
    INTO _media
    FROM public.job_media
   WHERE organisation_id = _org_id;

  -- Break the circular job <-> quote references before deleting either side.
  UPDATE public.service_calls SET quote_id = NULL
   WHERE organisation_id = _org_id AND quote_id IS NOT NULL;
  UPDATE public.quotes SET job_id = NULL
   WHERE organisation_id = _org_id AND job_id IS NOT NULL;

  DELETE FROM public.job_payments WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('job_payments', n);

  DELETE FROM public.payment_checkout_attempts WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('payment_checkout_attempts', n);

  DELETE FROM public.sumup_webhook_events WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('sumup_webhook_events', n);

  DELETE FROM public.invoice_line_items
   WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organisation_id = _org_id);
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('invoice_line_items', n);

  DELETE FROM public.invoices WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('invoices', n);

  DELETE FROM public.quote_line_items
   WHERE quote_id IN (SELECT id FROM public.quotes WHERE organisation_id = _org_id);
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('quote_line_items', n);

  DELETE FROM public.quotes WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('quotes', n);

  DELETE FROM public.job_media WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('job_media', n);

  DELETE FROM public.job_messages WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('job_messages', n);

  DELETE FROM public.job_tags WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('job_tags', n);

  DELETE FROM public.service_call_tags
   WHERE service_call_id IN (SELECT id FROM public.service_calls WHERE organisation_id = _org_id);
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('service_call_tags', n);

  DELETE FROM public.certificates WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('certificates', n);

  DELETE FROM public.cert2_certificates WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('cert2_certificates', n);

  DELETE FROM public.hazard_notifications WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('hazard_notifications', n);

  DELETE FROM public.parts_request_comments
   WHERE parts_request_id IN (SELECT id FROM public.parts_requests WHERE organisation_id = _org_id);
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('parts_request_comments', n);

  DELETE FROM public.parts_requests WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('parts_requests', n);

  DELETE FROM public.transactions WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('transactions', n);

  DELETE FROM public.service_calls WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('service_calls', n);

  DELETE FROM public.customer_activity WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('customer_activity', n);

  DELETE FROM public.customer_call_notes
   WHERE customer_id IN (SELECT id FROM public.customers WHERE organisation_id = _org_id);
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('customer_call_notes', n);

  DELETE FROM public.booking_links WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('booking_links', n);

  DELETE FROM public.customers WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('customers', n);

  DELETE FROM public.message_log WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('message_log', n);

  DELETE FROM public.whatsapp_messages WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('whatsapp_messages', n);

  DELETE FROM public.conversations WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('conversations', n);

  DELETE FROM public.notifications WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('notifications', n);

  DELETE FROM public.audit_log
   WHERE organisation_id = _org_id AND action_type <> 'org_data_reset';
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('audit_log', n);

  DELETE FROM public.tenant_activity_log WHERE organisation_id = _org_id;
  GET DIAGNOSTICS n = ROW_COUNT; _counts := _counts || jsonb_build_object('tenant_activity_log', n);

  RETURN jsonb_build_object('counts', _counts, 'media', _media);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_org_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_org_data(uuid) TO service_role;