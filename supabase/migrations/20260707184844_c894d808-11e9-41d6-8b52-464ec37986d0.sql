DROP TRIGGER IF EXISTS trg_service_calls_notify ON public.service_calls;
CREATE TRIGGER trg_service_calls_notify
AFTER INSERT OR UPDATE ON public.service_calls
FOR EACH ROW EXECUTE FUNCTION public.notify_on_job_change();

DROP TRIGGER IF EXISTS trg_service_calls_log_completed ON public.service_calls;
CREATE TRIGGER trg_service_calls_log_completed
AFTER UPDATE ON public.service_calls
FOR EACH ROW EXECUTE FUNCTION public.log_job_completed_activity();

DROP TRIGGER IF EXISTS trg_job_media_notify_video ON public.job_media;
CREATE TRIGGER trg_job_media_notify_video
AFTER INSERT ON public.job_media
FOR EACH ROW EXECUTE FUNCTION public.notify_on_video_upload();