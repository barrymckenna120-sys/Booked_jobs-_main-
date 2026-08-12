CREATE OR REPLACE FUNCTION public.notify_on_parts_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job_ref text;
  v_customer_name text;
  v_cancelled_by_name text;
  v_actor_role text;
  v_recipient record;
  v_body text;
  v_engineer record;
  v_job_engineer uuid;
  v_assigned_auth uuid;
BEGIN
  IF NEW.service_call_id IS NOT NULL THEN
    SELECT job_reference INTO v_job_ref
    FROM public.service_calls WHERE id = NEW.service_call_id LIMIT 1;
  END IF;
  v_job_ref := COALESCE(NULLIF(v_job_ref, ''), 'no job linked');

  v_customer_name := NULLIF(btrim(COALESCE(NEW.customer_name, '')), '');
  IF v_customer_name IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id LIMIT 1;
  END IF;
  v_customer_name := COALESCE(v_customer_name, 'Unknown customer');

  -- 1) Cancellation -> fan out to office-side users in the org
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'Cancelled'
     AND OLD.status IS DISTINCT FROM 'Cancelled' THEN

    IF NEW.cancelled_by IS NOT NULL THEN
      SELECT COALESCE(NULLIF(btrim(display_name), ''), NULL) INTO v_cancelled_by_name
      FROM public.profiles WHERE user_id = NEW.cancelled_by LIMIT 1;
    END IF;
    IF v_cancelled_by_name IS NULL AND NEW.cancelled_by IS NOT NULL THEN
      SELECT name INTO v_cancelled_by_name
      FROM public.engineers WHERE auth_user_id = NEW.cancelled_by LIMIT 1;
    END IF;
    v_cancelled_by_name := COALESCE(v_cancelled_by_name, 'Unknown user');

    v_body := NEW.description || ' · ' || v_customer_name || ' · ' || v_job_ref
              || ' · cancelled by ' || v_cancelled_by_name;

    FOR v_recipient IN
      SELECT auth_user_id FROM (
        SELECT auth_user_id FROM public.engineers
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner', 'manager', 'superadmin')
          AND status = 'active'
          AND auth_user_id IS NOT NULL
        UNION
        SELECT user_id AS auth_user_id FROM public.profiles
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner', 'manager', 'superadmin')
          AND COALESCE(is_active, true) = true
          AND user_id IS NOT NULL
      ) r
      WHERE (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (
        recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id
      ) VALUES (
        v_recipient.auth_user_id,
        'parts_cancelled',
        'Part Request Cancelled',
        v_body,
        NEW.service_call_id,
        'office',
        jsonb_build_object(
          'parts_request_id', NEW.id,
          'description', NEW.description,
          'customer_name', v_customer_name,
          'job_ref', v_job_ref,
          'cancelled_by_name', v_cancelled_by_name
        ),
        NEW.organisation_id
      );
    END LOOP;

    RETURN NULL;
  END IF;

  -- 2) Office-initiated notes/status change -> notify the engineer(s)
  IF TG_OP = 'UPDATE'
     AND (NEW.notes IS DISTINCT FROM OLD.notes OR NEW.status IS DISTINCT FROM OLD.status) THEN

    IF auth.uid() IS NULL THEN
      RETURN NULL;
    END IF;

    v_actor_role := public.get_user_role(auth.uid());
    IF v_actor_role NOT IN ('admin', 'office', 'owner', 'manager', 'superadmin') THEN
      RETURN NULL;
    END IF;

    IF NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
       AND NEW.service_call_id IS NOT NULL THEN
      SELECT e.auth_user_id INTO v_job_engineer
      FROM public.service_calls sc
      JOIN public.engineers e ON e.id = sc.assigned_engineer_id
      WHERE sc.id = NEW.service_call_id
      LIMIT 1;
    END IF;

    -- Office-created orders reference the engineer via assigned_to (engineers.id)
    -- only. Resolve that engineer's login as a last-resort notify target.
    IF NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
       AND NEW.assigned_to IS NOT NULL THEN
      SELECT auth_user_id INTO v_assigned_auth
      FROM public.engineers WHERE id = NEW.assigned_to LIMIT 1;
    END IF;

    IF NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
       AND NEW.logged_by IS NULL AND v_job_engineer IS NULL
       AND v_assigned_auth IS NULL THEN
      RETURN NULL;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_body := NEW.description || ' · ' || v_customer_name || ' · ' || v_job_ref
                || ' · status now ' || NEW.status;
    ELSE
      v_body := NEW.description || ' · ' || v_customer_name || ' · ' || v_job_ref
                || ' · note from office: ' || left(COALESCE(NEW.notes, ''), 120);
    END IF;

    FOR v_engineer IN
      SELECT DISTINCT uid FROM (
        SELECT NEW.engineer_id AS uid
        UNION
        SELECT NEW.assigned_engineer_id AS uid
        UNION
        SELECT CASE
          WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
          THEN NEW.logged_by END AS uid
        UNION
        SELECT CASE
          WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
          THEN v_job_engineer END AS uid
        UNION
        SELECT CASE
          WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
          THEN v_assigned_auth END AS uid
      ) s
      WHERE uid IS NOT NULL AND uid <> auth.uid()
    LOOP
      INSERT INTO public.notifications (
        recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id
      ) VALUES (
        v_engineer.uid,
        'parts_update',
        'Part Request Updated',
        v_body,
        NEW.service_call_id,
        'engineer',
        jsonb_build_object(
          'parts_request_id', NEW.id,
          'description', NEW.description,
          'customer_name', v_customer_name,
          'job_ref', v_job_ref,
          'status', NEW.status,
          'notes', NEW.notes
        ),
        NEW.organisation_id
      );
    END LOOP;
  END IF;

  RETURN NULL;
END;
$function$;