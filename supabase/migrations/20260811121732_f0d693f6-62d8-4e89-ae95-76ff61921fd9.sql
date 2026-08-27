REVOKE EXECUTE ON FUNCTION public.sync_job_status_from_parts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_job_parts_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_parts_request_customer() FROM PUBLIC, anon, authenticated;