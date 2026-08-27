-- 1. Add soft-delete columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid;

CREATE INDEX IF NOT EXISTS profiles_org_inactive_idx
  ON public.profiles (organisation_id)
  WHERE is_active = false;

-- 2. Update notification fan-out functions to skip non-active engineers.
--    Every SELECT ... FROM engineers WHERE role IN ('admin','office','owner')
--    now also filters status = 'active'.

CREATE OR REPLACE FUNCTION public.notify_on_job_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient RECORD;
  v_org_id uuid;
  v_job_ref text;
  v_assigned_engineer_id uuid;
  v_assigned_auth_id uuid;
  v_assigned_status text;
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organisation_id, job_reference, assigned_engineer_id
    INTO v_org_id, v_job_ref, v_assigned_engineer_id
  FROM public.service_calls
  WHERE id = NEW.job_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_role = 'engineer' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id
      FROM public.engineers
      WHERE organisation_id = v_org_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND auth_user_id <> NEW.sender_id
    LOOP
      INSERT INTO public.notifications (
        organisation_id, recipient_user_id, notification_type,
        title, body, job_id, role, is_read, created_at
      ) VALUES (
        v_org_id,
        v_recipient.auth_user_id,
        'message',
        'New Message – ' || COALESCE(v_job_ref, 'Job'),
        LEFT(NEW.message, 100),
        NEW.job_id,
        'office',
        false,
        now()
      );
    END LOOP;
  ELSE
    IF v_assigned_engineer_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT auth_user_id, status
      INTO v_assigned_auth_id, v_assigned_status
    FROM public.engineers
    WHERE id = v_assigned_engineer_id
    LIMIT 1;

    IF v_assigned_auth_id IS NULL
       OR v_assigned_auth_id = NEW.sender_id
       OR v_assigned_status <> 'active' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (
      organisation_id, recipient_user_id, notification_type,
      title, body, job_id, role, is_read, created_at
    ) VALUES (
      v_org_id,
      v_assigned_auth_id,
      'message',
      'New Message – ' || COALESCE(v_job_ref, 'Job'),
      LEFT(NEW.message, 100),
      NEW.job_id,
      'engineer',
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_quote_viewed(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
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

  SELECT q.user_id, q.quote_number, q.total_amount, c.name
  INTO v_user_id, v_quote_number, v_total_amount, v_customer_name
  FROM quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  WHERE q.id = p_quote_id;

  v_quote_number := COALESCE(v_quote_number, 'Q-' || upper(left(p_quote_id::text, 4)));
  v_customer_name := COALESCE(v_customer_name, 'Customer');

  INSERT INTO notifications (recipient_user_id, notification_type, title, body, role, metadata)
  VALUES (
    v_user_id,
    'message',
    '👀 Quote Viewed — ' || v_quote_number,
    v_customer_name || ' has opened ' || v_quote_number || '. Total: ' || chr(8364) || TRIM(TO_CHAR(v_total_amount, 'FM999,999.00')),
    'office',
    jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_number, 'quote_id', p_quote_id, 'total_amount', v_total_amount)
  );

  FOR v_recipient IN
    SELECT DISTINCT auth_user_id FROM engineers
    WHERE user_id = v_user_id
      AND role IN ('admin', 'office')
      AND status = 'active'
      AND auth_user_id IS NOT NULL
      AND auth_user_id != v_user_id
  LOOP
    INSERT INTO notifications (recipient_user_id, notification_type, title, body, role, metadata)
    VALUES (
      v_recipient.auth_user_id,
      'message',
      '👀 Quote Viewed — ' || v_quote_number,
      v_customer_name || ' has opened ' || v_quote_number || '. Total: ' || chr(8364) || TRIM(TO_CHAR(v_total_amount, 'FM999,999.00')),
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'quote_ref', v_quote_number, 'quote_id', p_quote_id, 'total_amount', v_total_amount)
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_job_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_name text;
  v_customer_address text;
  v_job_ref text;
  v_engineer_auth_id uuid;
  v_engineer_status text;
  v_old_engineer_name text;
  v_new_engineer_name text;
  v_engineer_name text;
  v_payment_label text;
  v_recipient record;
BEGIN
  v_job_ref := COALESCE(NEW.job_reference, 'KN-' || upper(left(NEW.id::text, 6)));
  SELECT name, address INTO v_customer_name, v_customer_address FROM public.customers WHERE id = NEW.customer_id LIMIT 1;
  v_customer_name := COALESCE(v_customer_name, 'Unknown');
  v_customer_address := COALESCE(v_customer_address, '');

  IF TG_OP = 'INSERT' AND NEW.source = 'Tally Form' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'new_job', '📥 New Incoming Job — ' || v_job_ref,
        v_customer_name || ' submitted a new ' || lower(NEW.job_type) || ' booking via the online form.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'job_type', NEW.job_type, 'source', 'Tally Form'),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.job_type IN ('Repair', 'Emergency') AND COALESCE(NEW.source, '') != 'Tally Form' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'new_repair', 'New Repair Job — ' || v_job_ref,
        v_customer_name || ' submitted a ' || lower(NEW.job_type) || ' request.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'job_type', NEW.job_type),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_engineer_id IS NOT NULL THEN
    SELECT auth_user_id, name, status INTO v_engineer_auth_id, v_new_engineer_name, v_engineer_status
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF v_engineer_auth_id IS NOT NULL AND v_engineer_status = 'active' THEN
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
        v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
        NEW.id, 'engineer',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref),
        NEW.organisation_id);
    END IF;
  END IF;

  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  IF NEW.assigned_engineer_id IS NOT NULL
     AND (OLD.assigned_engineer_id IS NULL OR OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id) THEN

    SELECT auth_user_id, name, status INTO v_engineer_auth_id, v_new_engineer_name, v_engineer_status
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF OLD.assigned_engineer_id IS NOT NULL AND OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id THEN
      SELECT name INTO v_old_engineer_name FROM public.engineers WHERE id = OLD.assigned_engineer_id LIMIT 1;

      IF v_engineer_auth_id IS NOT NULL AND v_engineer_status = 'active' THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_engineer_auth_id, 'reassigned', 'Job Reassigned — ' || v_job_ref,
          v_customer_name || ' reassigned from ' || COALESCE(v_old_engineer_name, 'another engineer') || '.',
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name),
          NEW.organisation_id);
      END IF;

      FOR v_recipient IN
        SELECT DISTINCT auth_user_id FROM public.engineers
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner')
          AND status = 'active'
          AND auth_user_id IS NOT NULL
          AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
      LOOP
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_recipient.auth_user_id, 'reassigned', 'Job Reassigned — ' || v_job_ref,
          v_customer_name || ' moved from ' || COALESCE(v_old_engineer_name, '—') || ' to ' || COALESCE(v_new_engineer_name, '—') || '.',
          NEW.id, 'office',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name, 'new_engineer', v_new_engineer_name),
          NEW.organisation_id);
      END LOOP;
    ELSE
      IF v_engineer_auth_id IS NOT NULL AND v_engineer_status = 'active' THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref),
          NEW.organisation_id);
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'En Route' AND OLD.status IS DISTINCT FROM 'En Route' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'en_route', 'En Route — ' || v_job_ref,
        COALESCE(v_engineer_name, 'Engineer') || ' is en route to ' || v_customer_name || '.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'engineer_name', v_engineer_name),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF NEW.status = 'On Site' AND OLD.status IS DISTINCT FROM 'On Site' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'on_site', 'On Site — ' || v_job_ref,
        COALESCE(v_engineer_name, 'Engineer') || ' has arrived at ' || v_customer_name || '.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'engineer_name', v_engineer_name),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF NEW.status = 'In Progress' AND OLD.status IS DISTINCT FROM 'In Progress' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'in_progress', 'Work Started — ' || v_job_ref,
        COALESCE(v_engineer_name, 'Engineer') || ' has started work at ' || v_customer_name || '.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'engineer_name', v_engineer_name),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    IF NEW.assigned_engineer_id IS NOT NULL THEN
      SELECT auth_user_id, status INTO v_engineer_auth_id, v_engineer_status
      FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
      IF v_engineer_auth_id IS NOT NULL AND v_engineer_status = 'active' THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_engineer_auth_id, 'cancelled', 'Job Cancelled — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason),
          NEW.organisation_id);
      END IF;
    END IF;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'cancelled', 'Job Cancelled — ' || v_job_ref,
        v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'no_show', 'No Show — ' || v_job_ref,
        v_customer_name || ' · Could not gain access.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF NEW.status = 'parts_needed' AND OLD.status IS DISTINCT FROM 'parts_needed' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'parts_needed', 'Parts Needed — ' || v_job_ref,
        v_customer_name || ' · Engineer requires parts to continue.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'notes', NEW.notes),
        NEW.organisation_id);
    END LOOP;
  END IF;

  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    IF NEW.payment_method IS NOT NULL THEN
      v_payment_label := CASE NEW.payment_method
        WHEN 'cash' THEN 'Cash'
        WHEN 'card' THEN 'Card'
        WHEN 'invoice' THEN 'Invoice Required'
        ELSE initcap(NEW.payment_method)
      END;
      SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
      FOR v_recipient IN
        SELECT DISTINCT auth_user_id FROM public.engineers
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner')
          AND status = 'active'
          AND auth_user_id IS NOT NULL
          AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
      LOOP
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_recipient.auth_user_id, 'payment_collected', 'Payment — ' || v_job_ref,
          v_customer_name || ' · ' || v_payment_label || ' · ' || COALESCE(v_engineer_name, 'Engineer'),
          NEW.id, 'office',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'payment_method', NEW.payment_method, 'engineer_name', v_engineer_name),
          NEW.organisation_id);
      END LOOP;
    END IF;

    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
        AND status = 'active'
        AND auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_recipient.auth_user_id, 'completed', 'Job Completed — ' || v_job_ref,
        v_customer_name || ' completed successfully.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref),
        NEW.organisation_id);
    END LOOP;

    IF NEW.follow_up_needed = true THEN
      FOR v_recipient IN
        SELECT DISTINCT auth_user_id FROM public.engineers
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner')
          AND status = 'active'
          AND auth_user_id IS NOT NULL
          AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
      LOOP
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_recipient.auth_user_id, 'follow_up', '⚠️ Follow-up Required — ' || v_job_ref,
          'Follow-up required — ' || v_customer_name || ', ' || v_customer_address || '. ' || COALESCE(NEW.follow_up_detail, ''),
          NEW.id, 'office',
          jsonb_build_object('customer_name', v_customer_name, 'address', v_customer_address, 'job_ref', v_job_ref, 'follow_up_detail', NEW.follow_up_detail),
          NEW.organisation_id);
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
