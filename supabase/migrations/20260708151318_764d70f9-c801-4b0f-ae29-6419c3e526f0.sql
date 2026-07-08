
CREATE OR REPLACE FUNCTION public.notify_on_job_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient RECORD;
  v_org_id uuid;
  v_job_ref text;
  v_assigned_engineer_id uuid;
  v_assigned_auth_id uuid;
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
    -- Engineer -> office/admin/owner fan-out
    FOR v_recipient IN
      SELECT DISTINCT auth_user_id
      FROM public.engineers
      WHERE organisation_id = v_org_id
        AND role IN ('admin', 'office', 'owner')
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
    -- Office/admin/owner (or any non-engineer sender) -> assigned engineer only
    IF v_assigned_engineer_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT auth_user_id
      INTO v_assigned_auth_id
    FROM public.engineers
    WHERE id = v_assigned_engineer_id
    LIMIT 1;

    IF v_assigned_auth_id IS NULL OR v_assigned_auth_id = NEW.sender_id THEN
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
$$;

DROP TRIGGER IF EXISTS on_job_message_insert ON public.job_messages;
CREATE TRIGGER on_job_message_insert
  AFTER INSERT ON public.job_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_job_message();
