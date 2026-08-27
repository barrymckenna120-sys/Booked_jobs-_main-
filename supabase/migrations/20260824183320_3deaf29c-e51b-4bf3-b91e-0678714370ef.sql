-- Trigger functions are never called directly by clients: only the table trigger
-- (which runs as the definer) needs EXECUTE. Keeps the new function out of the
-- exposed API surface.
REVOKE EXECUTE ON FUNCTION public.sync_invoice_status_from_job() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_invoice_status_from_job() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_invoice_status_from_job() FROM authenticated;