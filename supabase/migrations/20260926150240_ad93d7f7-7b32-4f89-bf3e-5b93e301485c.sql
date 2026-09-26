DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.respond_to_quote(uuid,boolean,uuid)'::regprocedure);
  n := replace(d, '  -- Accepted: create the converted job unless one already exists.',
$blk$  -- Reuse the placeholder job the quote was raised against (same customer/org,
  -- still Pending, not linked to another quote, nothing paid) instead of
  -- inserting a second job for the same work.
  IF v_quote.converted_job_id IS NULL AND v_quote.job_id IS NOT NULL THEN
    UPDATE service_calls
    SET status = 'incoming',
        has_quote = true,
        job_type = COALESCE(NULLIF(v_quote.job_type, 'other'), job_type),
        revenue = v_quote.total_amount,
        deposit_amount = v_effective_deposit,
        balance_due = COALESCE(v_quote.total_amount, 0),
        deposit_required = (v_effective_deposit > 0),
        payment_link = COALESCE(v_quote.payment_link, payment_link),
        quote_id = p_quote_id
    WHERE id = v_quote.job_id
      AND customer_id = v_quote.customer_id
      AND organisation_id = v_organisation_id
      AND status = 'Pending'
      AND quote_id IS NULL
      AND COALESCE(deposit_paid, false) = false
    RETURNING id INTO v_new_job_id;
    IF v_new_job_id IS NOT NULL THEN
      v_quote.converted_job_id := v_new_job_id;
    END IF;
  END IF;

  -- Accepted: create the converted job unless one already exists.$blk$);
  IF n = d THEN RAISE EXCEPTION 'anchor not found'; END IF;
  EXECUTE n;
END
$mig$;