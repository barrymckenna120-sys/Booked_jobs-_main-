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

  -- INSERT: new incoming job from Tally Form (office fan-out)
  IF TG_OP = 'INSERT' AND NEW.source = 'Tally Form' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- INSERT: new repair job notification for office (fan-out)
  IF TG_OP = 'INSERT' AND NEW.job_type IN ('Repair', 'Emergency') AND COALESCE(NEW.source, '') != 'Tally Form' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- INSERT: if engineer is already assigned at creation, notify engineer
  IF TG_OP = 'INSERT' AND NEW.assigned_engineer_id IS NOT NULL THEN
    SELECT auth_user_id, name INTO v_engineer_auth_id, v_new_engineer_name
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF v_engineer_auth_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
      VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
        v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
        NEW.id, 'engineer',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref),
        NEW.organisation_id);
    END IF;
  END IF;

  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- Engineer assigned/reassigned
  IF NEW.assigned_engineer_id IS NOT NULL
     AND (OLD.assigned_engineer_id IS NULL OR OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id) THEN

    SELECT auth_user_id, name INTO v_engineer_auth_id, v_new_engineer_name
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF OLD.assigned_engineer_id IS NOT NULL AND OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id THEN
      SELECT name INTO v_old_engineer_name FROM public.engineers WHERE id = OLD.assigned_engineer_id LIMIT 1;

      IF v_engineer_auth_id IS NOT NULL THEN
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
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id)
        VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref),
          NEW.organisation_id);
      END IF;
    END IF;
  END IF;

  -- En Route (office fan-out)
  IF NEW.status = 'En Route' AND OLD.status IS DISTINCT FROM 'En Route' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- On Site (office fan-out)
  IF NEW.status = 'On Site' AND OLD.status IS DISTINCT FROM 'On Site' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- In Progress (office fan-out)
  IF NEW.status = 'In Progress' AND OLD.status IS DISTINCT FROM 'In Progress' THEN
    SELECT name INTO v_engineer_name FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- Cancelled
  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    IF NEW.assigned_engineer_id IS NOT NULL THEN
      SELECT auth_user_id INTO v_engineer_auth_id FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
      IF v_engineer_auth_id IS NOT NULL THEN
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

  -- No show (office fan-out)
  IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- Parts needed (office fan-out)
  IF NEW.status = 'parts_needed' AND OLD.status IS DISTINCT FROM 'parts_needed' THEN
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM public.engineers
      WHERE organisation_id = NEW.organisation_id
        AND role IN ('admin', 'office', 'owner')
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

  -- Completed
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