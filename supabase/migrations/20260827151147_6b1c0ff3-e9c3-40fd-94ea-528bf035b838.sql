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
  v_recipient record;
  v_body text;
  v_detail text;
  v_engineer_name text;
  v_job_engineer uuid;
  v_assigned_auth uuid;
  v_office uuid[];
  v_actor uuid;
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

  IF NEW.service_call_id IS NOT NULL THEN
    SELECT e.auth_user_id INTO v_job_engineer
    FROM public.service_calls sc
    JOIN public.engineers e ON e.id = sc.assigned_engineer_id
    WHERE sc.id = NEW.service_call_id
    LIMIT 1;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    SELECT auth_user_id INTO v_assigned_auth
    FROM public.engineers WHERE id = NEW.assigned_to LIMIT 1;
  END IF;

  v_actor := COALESCE(auth.uid(), NEW.logged_by);

  -- 0) New request logged -> office fan-out plus the linked job's engineer
  IF TG_OP = 'INSERT' THEN
    v_engineer_name := NULLIF(btrim(COALESCE(NEW.logged_by_name, '')), '');
    IF v_engineer_name IS NULL AND NEW.logged_by IS NOT NULL THEN
      SELECT name INTO v_engineer_name FROM public.engineers WHERE auth_user_id = NEW.logged_by LIMIT 1;
    END IF;
    IF v_engineer_name IS NULL AND NEW.logged_by IS NOT NULL THEN
      SELECT NULLIF(btrim(display_name), '') INTO v_engineer_name
      FROM public.profiles WHERE user_id = NEW.logged_by LIMIT 1;
    END IF;
    v_engineer_name := COALESCE(v_engineer_name, 'Unknown engineer');

    v_detail := NEW.description
              || CASE WHEN COALESCE(NEW.quantity, 1) > 1 THEN ' · x' || NEW.quantity ELSE '' END
              || ' · ' || COALESCE(NEW.priority, 'normal') || ' priority';

    v_body := v_job_ref || ' – ' || v_customer_name || ' – ' || v_engineer_name
              || ' – Parts need to be ordered · ' || v_detail;

    -- Eligible office recipients, strictly scoped to this request's organisation.
    SELECT array_agg(DISTINCT auth_user_id) INTO v_office
    FROM (
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
      UNION
      SELECT user_id AS auth_user_id FROM public.profiles
      WHERE organisation_id = NEW.organisation_id
        AND receives_ops_notifications = true
        AND user_id IS NOT NULL
    ) r
    WHERE auth_user_id IS NOT NULL;

    -- Skip the person who logged the request ONLY when someone else in the org
    -- can receive the alert. Single-account setups (owner uses both the engineer
    -- and office app) must still get the office bell — otherwise the alert is
    -- dropped entirely, which is exactly what happened for Dublin Gas.
    IF v_actor IS NOT NULL
       AND v_office IS NOT NULL
       AND array_length(v_office, 1) > 1
       AND v_actor = ANY (v_office) THEN
      v_office := array_remove(v_office, v_actor);
    END IF;

    IF v_office IS NOT NULL THEN
      FOR v_recipient IN SELECT unnest(v_office) AS auth_user_id
      LOOP
        INSERT INTO public.notifications (
          recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id
        ) VALUES (
          v_recipient.auth_user_id,
          'parts_requested',
          'New Parts Request',
          v_body,
          NEW.service_call_id,
          'office',
          jsonb_build_object(
            'parts_request_id', NEW.id,
            'description', NEW.description,
            'quantity', NEW.quantity,
            'priority', NEW.priority,
            'status', COALESCE(NEW.status, 'Open'),
            'customer_name', v_customer_name,
            'job_ref', v_job_ref,
            'engineer_name', v_engineer_name,
            'logged_by_name', NEW.logged_by_name
          ),
          NEW.organisation_id
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    IF v_job_engineer IS NOT NULL
       AND (auth.uid() IS NULL OR v_job_engineer <> auth.uid())
       AND (NEW.logged_by IS NULL OR NEW.logged_by <> v_job_engineer) THEN
      INSERT INTO public.notifications (
        recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id
      ) VALUES (
        v_job_engineer,
        'parts_requested',
        'Part Being Sourced',
        NEW.description
          || CASE WHEN COALESCE(NEW.quantity, 1) > 1 THEN ' · x' || NEW.quantity ELSE '' END
          || ' · ' || v_customer_name || ' · ' || v_job_ref
          || ' · being sourced for your job',
        NEW.service_call_id,
        'engineer',
        jsonb_build_object(
          'parts_request_id', NEW.id,
          'description', NEW.description,
          'quantity', NEW.quantity,
          'priority', NEW.priority,
          'status', COALESCE(NEW.status, 'Open'),
          'customer_name', v_customer_name,
          'job_ref', v_job_ref,
          'engineer_name', v_engineer_name,
          'logged_by_name', NEW.logged_by_name
        ),
        NEW.organisation_id
      )
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN NULL;
  END IF;

  -- 1) Cancellation -> office, ops account, requester and the linked job's engineer
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
      SELECT auth_user_id, bool_and(is_engineer) AS engineer_only FROM (
        SELECT auth_user_id, false AS is_engineer FROM public.engineers
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner', 'manager', 'superadmin')
          AND status = 'active'
          AND auth_user_id IS NOT NULL
        UNION ALL
        SELECT user_id, false FROM public.profiles
        WHERE organisation_id = NEW.organisation_id
          AND role IN ('admin', 'office', 'owner', 'manager', 'superadmin')
          AND COALESCE(is_active, true) = true
          AND user_id IS NOT NULL
        UNION ALL
        SELECT user_id, false FROM public.profiles
        WHERE organisation_id = NEW.organisation_id
          AND receives_ops_notifications = true
          AND user_id IS NOT NULL
        UNION ALL
        SELECT NEW.logged_by, true WHERE NEW.logged_by IS NOT NULL
        UNION ALL
        SELECT NEW.engineer_id, true WHERE NEW.engineer_id IS NOT NULL
        UNION ALL
        SELECT NEW.assigned_engineer_id, true WHERE NEW.assigned_engineer_id IS NOT NULL
        UNION ALL
        SELECT v_job_engineer, true WHERE v_job_engineer IS NOT NULL
        UNION ALL
        SELECT v_assigned_auth, true WHERE v_assigned_auth IS NOT NULL
      ) r(auth_user_id, is_engineer)
      WHERE auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
      GROUP BY auth_user_id
    LOOP
      INSERT INTO public.notifications (
        recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id
      ) VALUES (
        v_recipient.auth_user_id,
        'parts_cancelled',
        'Part Request Cancelled',
        v_body,
        NEW.service_call_id,
        CASE WHEN v_recipient.engineer_only THEN 'engineer' ELSE 'office' END,
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

  -- 2) Ordered / Ready to Fit -> the engineers tied to this request
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('Ordered', 'Ready to Fit')
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    v_body := NEW.description || ' · ' || v_customer_name || ' · ' || v_job_ref
              || ' · ' || CASE WHEN NEW.status = 'Ordered' THEN 'has been ordered' ELSE 'is ready to fit' END;

    FOR v_recipient IN
      SELECT DISTINCT auth_user_id FROM (
        SELECT NEW.logged_by AS auth_user_id WHERE NEW.logged_by IS NOT NULL
        UNION
        SELECT NEW.engineer_id WHERE NEW.engineer_id IS NOT NULL
        UNION
        SELECT NEW.assigned_engineer_id WHERE NEW.assigned_engineer_id IS NOT NULL
        UNION
        SELECT v_job_engineer WHERE v_job_engineer IS NOT NULL
        UNION
        SELECT v_assigned_auth WHERE v_assigned_auth IS NOT NULL
      ) r
      WHERE auth_user_id IS NOT NULL
        AND (auth.uid() IS NULL OR auth_user_id <> auth.uid())
    LOOP
      INSERT INTO public.notifications (
        recipient_user_id, notification_type, title, body, job_id, role, metadata, organisation_id
      ) VALUES (
        v_recipient.auth_user_id,
        'parts_update',
        CASE WHEN NEW.status = 'Ordered' THEN 'Part Ordered' ELSE 'Part Ready to Fit' END,
        v_body,
        NEW.service_call_id,
        'engineer',
        jsonb_build_object(
          'parts_request_id', NEW.id,
          'description', NEW.description,
          'customer_name', v_customer_name,
          'job_ref', v_job_ref,
          'status', NEW.status
        ),
        NEW.organisation_id
      );
    END LOOP;

    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$function$;