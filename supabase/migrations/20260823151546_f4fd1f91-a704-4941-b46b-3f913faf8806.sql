-- The guard added in the previous migration is a TRIGGER function. It inherited
-- Postgres' default PUBLIC EXECUTE, which the linter correctly flags
-- (0028/0029). Triggers are invoked by the executor, never by a client, so no
-- app role needs EXECUTE. This matches the existing lockdown on the sibling
-- parts triggers (log_parts_request_activity, notify_on_parts_request_change),
-- whose ACLs are postgres/service_role only.
REVOKE ALL ON FUNCTION public.protect_parts_request_office_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_parts_request_office_fields() FROM anon;
REVOKE ALL ON FUNCTION public.protect_parts_request_office_fields() FROM authenticated;
