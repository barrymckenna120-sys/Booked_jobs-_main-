-- =========================================
-- F2: SECURITY DEFINER execute grant lockdown
-- =========================================

-- Bucket A — public, token-gated (anon + authenticated)

REVOKE EXECUTE ON FUNCTION public.get_booking_link_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_link_by_token(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_quote_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_by_token(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.respond_to_quote(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_quote(uuid, boolean, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_quote_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_public(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_quote_viewed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_quote_viewed(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_receipt_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_receipt_public(text) TO anon, authenticated;

-- Bucket B — authenticated only

REVOKE EXECUTE ON FUNCTION public.get_my_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_org_profile_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_profile_directory() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_quote_by_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_by_number(text) TO authenticated;

-- Bucket C — internal only (revoke from PUBLIC, anon, authenticated — no replacement grant)

REVOKE EXECUTE ON FUNCTION public.bootstrap_impersonation_hmac(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_impersonation_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_org_invoice_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_organisation_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_engineer_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ignored_number(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_job_booked_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_job_completed_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_job_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_job_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_parts_request_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_video_upload() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_job_status_from_parts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_engineer_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_superadmin_self_assign() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_overdue_quotes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cert_pdf(text) FROM PUBLIC, anon, authenticated;