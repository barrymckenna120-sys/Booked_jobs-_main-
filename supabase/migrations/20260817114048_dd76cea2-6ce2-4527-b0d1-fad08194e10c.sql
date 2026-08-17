ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_notification_read_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_read IS TRUE AND (OLD.is_read IS DISTINCT FROM TRUE) AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  ELSIF NEW.is_read IS NOT TRUE AND OLD.is_read IS TRUE THEN
    NEW.read_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_stamp_read_at ON public.notifications;
CREATE TRIGGER notifications_stamp_read_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.stamp_notification_read_at();

CREATE INDEX IF NOT EXISTS notifications_is_read_read_at_idx
  ON public.notifications (is_read, read_at);

CREATE OR REPLACE FUNCTION public.purge_old_read_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE is_read = true
    AND coalesce(read_at, created_at) < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_read_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_old_read_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_old_read_notifications() FROM authenticated;