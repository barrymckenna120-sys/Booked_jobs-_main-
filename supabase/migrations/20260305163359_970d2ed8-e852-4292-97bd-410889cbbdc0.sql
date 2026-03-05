
CREATE OR REPLACE FUNCTION public.notify_on_job_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_name text;
  v_job_ref text;
  v_engineer_auth_id uuid;
  v_old_engineer_name text;
  v_new_engineer_name text;
  v_engineer_name text;
  v_payment_label text;
BEGIN
  v_job_ref := 'BJ-' || upper(left(NEW.id::text, 6));
  SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id LIMIT 1;
  v_customer_name := COALESCE(v_customer_name, 'Unknown');

  -- INSERT: new repair job notification for office
  IF TG_OP = 'INSERT' AND NEW.job_type IN ('Repair', 'Emergency') THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'new_repair', 'New Repair Job — ' || v_job_ref,
      v_customer_name || ' submitted a ' || lower(NEW.job_type) || ' request.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'job_type', NEW.job_type));
  END IF;

  -- INSERT: if engineer is already assigned at creation, notify engineer
  IF TG_OP = 'INSERT' AND NEW.assigned_engineer_id IS NOT NULL THEN
    SELECT auth_user_id, name INTO v_engineer_auth_id, v_new_engineer_name
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    IF v_engineer_auth_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
        v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
        NEW.id, 'engineer',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
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
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (v_engineer_auth_id, 'reassigned', 'Job Reassigned — ' || v_job_ref,
          v_customer_name || ' reassigned from ' || COALESCE(v_old_engineer_name, 'another engineer') || '.',
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name));
      END IF;

      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (NEW.user_id, 'reassigned', 'Job Reassigned — ' || v_job_ref,
        v_customer_name || ' moved from ' || COALESCE(v_old_engineer_name, '—') || ' to ' || COALESCE(v_new_engineer_name, '—') || '.',
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name, 'new_engineer', v_new_engineer_name));
    ELSE
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (v_engineer_auth_id, 'new_job', 'New Job Assigned — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
      END IF;
    END IF;
  END IF;

  -- Cancelled
  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    IF NEW.assigned_engineer_id IS NOT NULL THEN
      SELECT auth_user_id INTO v_engineer_auth_id FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (v_engineer_auth_id, 'cancelled', 'Job Cancelled — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
          NEW.id, 'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason));
      END IF;
    END IF;
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'cancelled', 'Job Cancelled — ' || v_job_ref,
      v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason));
  END IF;

  -- No show
  IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'no_show', 'No Show — ' || v_job_ref,
      v_customer_name || ' · Could not gain access.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
  END IF;

  -- Parts needed
  IF NEW.status = 'parts_needed' AND OLD.status IS DISTINCT FROM 'parts_needed' THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'parts_needed', 'Parts Needed — ' || v_job_ref,
      v_customer_name || ' · Engineer requires parts to continue.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'notes', NEW.notes));
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

      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (NEW.user_id, 'payment_collected', 'Payment — ' || v_job_ref,
        v_customer_name || ' · ' || v_payment_label || ' · ' || COALESCE(v_engineer_name, 'Engineer'),
        NEW.id, 'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'payment_method', NEW.payment_method, 'engineer_name', v_engineer_name));
    END IF;

    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (NEW.user_id, 'completed', 'Job Completed — ' || v_job_ref,
      v_customer_name || ' completed successfully.',
      NEW.id, 'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref));
  END IF;

  RETURN NEW;
END;
$function$;
