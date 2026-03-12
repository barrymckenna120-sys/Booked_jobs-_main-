
CREATE OR REPLACE FUNCTION public.notify_on_video_upload()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_job_ref text;
  v_customer_name text;
  v_engineer_name text;
  v_job_owner_id uuid;
  v_is_video boolean;
BEGIN
  -- Check if this is a video upload
  v_is_video := (
    NEW.file_type = 'video'
    OR NEW.file_type LIKE 'video/%'
    OR (NEW.public_url IS NOT NULL AND NEW.public_url LIKE '%cloudinary.com%')
  );

  IF NOT v_is_video THEN
    RETURN NEW;
  END IF;

  -- Get job details
  SELECT
    sc.user_id,
    c.name
  INTO v_job_owner_id, v_customer_name
  FROM public.service_calls sc
  LEFT JOIN public.customers c ON c.id = sc.customer_id
  WHERE sc.id = NEW.job_id
  LIMIT 1;

  IF v_job_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_customer_name := COALESCE(v_customer_name, 'Unknown');
  v_job_ref := 'BJ-' || upper(left(NEW.job_id::text, 6));

  -- Get engineer name from the uploading user
  SELECT name INTO v_engineer_name
  FROM public.engineers
  WHERE auth_user_id = NEW.user_id
  LIMIT 1;

  v_engineer_name := COALESCE(v_engineer_name, 'Engineer');

  -- Create notification for office/admin (the job owner)
  -- Only if the uploader is not the job owner (i.e. it's an engineer)
  IF NEW.user_id IS DISTINCT FROM v_job_owner_id THEN
    INSERT INTO public.notifications (
      recipient_user_id,
      notification_type,
      title,
      body,
      job_id,
      role,
      metadata
    ) VALUES (
      v_job_owner_id,
      'new_video_uploaded',
      '📹 New Video — ' || v_job_ref,
      v_engineer_name || ' uploaded a video for ' || v_customer_name,
      NEW.job_id,
      'office',
      jsonb_build_object(
        'customer_name', v_customer_name,
        'engineer_name', v_engineer_name,
        'job_ref', v_job_ref,
        'media_id', NEW.id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to job_media table
DROP TRIGGER IF EXISTS trg_notify_on_video_upload ON public.job_media;
CREATE TRIGGER trg_notify_on_video_upload
  AFTER INSERT ON public.job_media
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_video_upload();
