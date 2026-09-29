CREATE OR REPLACE FUNCTION public.push_on_engineer_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  IF NEW.notification_type IS DISTINCT FROM 'message' OR NEW.role IS DISTINCT FROM 'engineer' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'push_function_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'push_on_engineer_message_notification: vault value missing, notification % not pushed', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object('notification_id', NEW.id)
    ) INTO v_request_id;
    RAISE LOG 'push_on_engineer_message_notification: notification % pg_net request %', NEW.id, v_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push_on_engineer_message_notification: pg_net call failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.push_on_engineer_message_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_push_on_engineer_message_notification ON public.notifications;
CREATE TRIGGER trg_push_on_engineer_message_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.push_on_engineer_message_notification();