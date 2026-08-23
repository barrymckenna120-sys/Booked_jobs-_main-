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
  v_customer_name text;
  v_sender_name text;
  v_title text;
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sc.organisation_id, sc.job_reference, sc.assigned_engineer_id, c.name
    INTO v_org_id, v_job_ref, v_assigned_engineer_id, v_customer_name
  FROM public.service_calls sc
  LEFT JOIN public.customers c ON c.id = sc.customer_id
  WHERE sc.id = NEW.job_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve sender display name
  IF NEW.sender_role = 'engineer' THEN
    SELECT name INTO v_sender_name
    FROM public.engineers
    WHERE auth_user_id = NEW.sender_id
    LIMIT 1;
    v_sender_name := NULLIF(TRIM(COALESCE(v_sender_name, '')), '');
    v_sender_name := COALESCE(v_sender_name, 'Engineer');
  ELSE
    SELECT display_name INTO v_sender_name
    FROM public.profiles
    WHERE user_id = NEW.sender_id
    LIMIT 1;
    v_sender_name := NULLIF(TRIM(COALESCE(v_sender_name, '')), '');
    v_sender_name := COALESCE(v_sender_name, 'Office');
  END IF;

  v_customer_name := NULLIF(TRIM(COALESCE(v_customer_name, '')), '');
  v_job_ref := NULLIF(TRIM(COALESCE(v_job_ref, '')), '');

  -- "Karl – Mary Byrne (KN-515)" with graceful degradation
  v_title := v_sender_name;
  IF v_customer_name IS NOT NULL THEN
    v_title := v_title || ' – ' || v_customer_name;
  END IF;
  IF v_job_ref IS NOT NULL THEN
    v_title := v_title || ' (' || v_job_ref || ')';
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
        v_title,
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
      v_title,
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