CREATE UNIQUE INDEX IF NOT EXISTS notifications_message_once
  ON public.notifications (recipient_user_id, ((metadata ->> 'message_id')))
  WHERE notification_type = 'message';

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
  v_customer_id uuid;
  v_customer_name text;
  v_sender_name text;
  v_role_label text;
  v_title text;
  v_metadata jsonb;
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sc.organisation_id, sc.job_reference, sc.assigned_engineer_id, sc.customer_id, c.name
    INTO v_org_id, v_job_ref, v_assigned_engineer_id, v_customer_id, v_customer_name
  FROM public.service_calls sc
  LEFT JOIN public.customers c ON c.id = sc.customer_id
  WHERE sc.id = NEW.job_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sender display name always resolved from the message author (NEW.sender_id),
  -- never from the assigned engineer, job owner, recipient or customer.
  IF NEW.sender_role = 'engineer' THEN
    v_role_label := 'Engineer';
    SELECT name INTO v_sender_name
    FROM public.engineers
    WHERE auth_user_id = NEW.sender_id
      AND organisation_id = v_org_id
    LIMIT 1;
  ELSE
    v_role_label := 'Office';
    SELECT display_name INTO v_sender_name
    FROM public.profiles
    WHERE user_id = NEW.sender_id
      AND organisation_id = v_org_id
    LIMIT 1;
  END IF;

  v_sender_name := NULLIF(TRIM(COALESCE(v_sender_name, '')), '');
  v_sender_name := COALESCE(v_sender_name, v_role_label);

  v_customer_name := NULLIF(TRIM(COALESCE(v_customer_name, '')), '');
  v_job_ref := NULLIF(TRIM(COALESCE(v_job_ref, '')), '');

  -- "John Smith (Engineer) sent you a message — Job DG-100"
  v_title := v_sender_name || ' (' || v_role_label || ') sent you a message';
  IF v_job_ref IS NOT NULL THEN
    v_title := v_title || ' — Job ' || v_job_ref;
  END IF;

  v_metadata := jsonb_build_object(
    'message_id', NEW.id,
    'conversation_id', NEW.job_id,
    'sender_id', NEW.sender_id,
    'sender_name', v_sender_name,
    'sender_role', NEW.sender_role,
    'job_id', NEW.job_id,
    'job_reference', v_job_ref,
    'customer_id', v_customer_id,
    'customer_name', v_customer_name,
    'organisation_id', v_org_id
  );

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
        title, body, job_id, role, metadata, is_read, created_at
      ) VALUES (
        v_org_id, v_recipient.auth_user_id, 'message',
        v_title, LEFT(NEW.message, 100), NEW.job_id, 'office',
        v_metadata, false, now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    IF v_assigned_engineer_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT auth_user_id, status
      INTO v_assigned_auth_id, v_assigned_status
    FROM public.engineers
    WHERE id = v_assigned_engineer_id
      AND organisation_id = v_org_id
    LIMIT 1;

    IF v_assigned_auth_id IS NULL
       OR v_assigned_auth_id = NEW.sender_id
       OR v_assigned_status <> 'active' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (
      organisation_id, recipient_user_id, notification_type,
      title, body, job_id, role, metadata, is_read, created_at
    ) VALUES (
      v_org_id, v_assigned_auth_id, 'message',
      v_title, LEFT(NEW.message, 100), NEW.job_id, 'engineer',
      v_metadata, false, now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;