
CREATE OR REPLACE FUNCTION public.notify_on_job_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_name text;
  v_job_ref text;
  v_engineer_auth_id uuid;
  v_old_engineer_name text;
  v_new_engineer_name text;
BEGIN
  -- Build job reference
  v_job_ref := 'BJ-' || upper(left(NEW.id::text, 6));

  -- Get customer name
  SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id LIMIT 1;
  v_customer_name := COALESCE(v_customer_name, 'Unknown');

  -- ===== INSERT: new repair job → notify admin =====
  IF TG_OP = 'INSERT' AND NEW.job_type IN ('Repair', 'Emergency') THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (
      NEW.user_id,
      'new_repair',
      'New Repair Job — ' || v_job_ref,
      v_customer_name || ' submitted a ' || lower(NEW.job_type) || ' request.',
      NEW.id,
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'job_type', NEW.job_type)
    );
  END IF;

  -- Only handle UPDATE from here
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- ===== Engineer assigned (was null or changed) → new_job to engineer =====
  IF NEW.assigned_engineer_id IS NOT NULL
     AND (OLD.assigned_engineer_id IS NULL OR OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id) THEN

    SELECT auth_user_id, name INTO v_engineer_auth_id, v_new_engineer_name
    FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;

    -- If reassigned (old was set), also send reassigned notification
    IF OLD.assigned_engineer_id IS NOT NULL AND OLD.assigned_engineer_id IS DISTINCT FROM NEW.assigned_engineer_id THEN
      SELECT name INTO v_old_engineer_name FROM public.engineers WHERE id = OLD.assigned_engineer_id LIMIT 1;

      -- Notify new engineer about reassignment
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (
          v_engineer_auth_id,
          'reassigned',
          'Job Reassigned — ' || v_job_ref,
          v_customer_name || ' reassigned from ' || COALESCE(v_old_engineer_name, 'another engineer') || '.',
          NEW.id,
          'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name)
        );
      END IF;

      -- Notify office
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
      VALUES (
        NEW.user_id,
        'reassigned',
        'Job Reassigned — ' || v_job_ref,
        v_customer_name || ' moved from ' || COALESCE(v_old_engineer_name, '—') || ' to ' || COALESCE(v_new_engineer_name, '—') || '.',
        NEW.id,
        'office',
        jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'old_engineer', v_old_engineer_name, 'new_engineer', v_new_engineer_name)
      );
    ELSE
      -- First assignment → new_job to engineer
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (
          v_engineer_auth_id,
          'new_job',
          'New Job Assigned — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.time_block, 'No time') || ' · ' || COALESCE(NEW.scheduled_date::text, 'TBC'),
          NEW.id,
          'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref)
        );
      END IF;
    END IF;
  END IF;

  -- ===== Status changed to Cancelled → notify engineer + office =====
  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    -- Notify engineer if assigned
    IF NEW.assigned_engineer_id IS NOT NULL THEN
      SELECT auth_user_id INTO v_engineer_auth_id FROM public.engineers WHERE id = NEW.assigned_engineer_id LIMIT 1;
      IF v_engineer_auth_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
        VALUES (
          v_engineer_auth_id,
          'cancelled',
          'Job Cancelled — ' || v_job_ref,
          v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
          NEW.id,
          'engineer',
          jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason)
        );
      END IF;
    END IF;
    -- Notify office
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (
      NEW.user_id,
      'cancelled',
      'Job Cancelled — ' || v_job_ref,
      v_customer_name || ' · ' || COALESCE(NEW.cancellation_reason, 'No reason given'),
      NEW.id,
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref, 'reason', NEW.cancellation_reason)
    );
  END IF;

  -- ===== Status changed to no_show → notify office =====
  IF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (
      NEW.user_id,
      'no_show',
      'No Show — ' || v_job_ref,
      v_customer_name || ' · Could not gain access.',
      NEW.id,
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref)
    );
  END IF;

  -- ===== Status changed to Completed → notify office =====
  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, body, job_id, role, metadata)
    VALUES (
      NEW.user_id,
      'completed',
      'Job Completed — ' || v_job_ref,
      v_customer_name || ' completed successfully.',
      NEW.id,
      'office',
      jsonb_build_object('customer_name', v_customer_name, 'job_ref', v_job_ref)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to service_calls
DROP TRIGGER IF EXISTS trg_notify_on_job_change ON public.service_calls;
CREATE TRIGGER trg_notify_on_job_change
  AFTER INSERT OR UPDATE ON public.service_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_job_change();
