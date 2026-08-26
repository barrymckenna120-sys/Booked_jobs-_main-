import type { Database } from "@/integrations/supabase/types";

export type ServiceCall = Database["public"]["Tables"]["service_calls"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];

export const SERVICE_CALL_BASE_SELECT = [
  "id",
  "user_id",
  "customer_id",
  "scheduled_date",
  "time_block",
  "status",
  "job_type",
  "boiler_brand",
  "boiler_issue",
  "job_issue",
  "extra_details",
  "notes",
  "access_notes",
  "boiler_type",
  "boiler_error_code",
  "boiler_working",
  "owner_or_tenant",
  "deposit_paid",
  "deposit_amount",
  "assigned_engineer",
  "assigned_engineer_id",
  "payment_link",
  "payment_status",
  "receipt_number",
  "completed_at",
  "payment_method",
  "paid_at",
  "invoiced_at",
  "cancellation_reason",
  "cancellation_note",
  "cancelled_at",
  "cancelled_by",
  "parts_priority",
  "parts_logged_at",
  "follow_up_needed",
  "follow_up_detail",
  "source",
  "incoming_status",
  "revenue",
  "balance_due",
  "receipt_sent",
  "whatsapp_confirmation_sent",
  "reminder_30day_sent",
  "reminder_14day_sent",
  "reminder_2day_sent",
  "payment_collected_by",
  "has_quote",
  "needs_scheduling",
  "sumup_checkout_id",
  "email",
  "area_code",
  "tally_submission_id",
  "created_at",
  "updated_at",
].join(", ");
/**
 * Values written to `service_calls.customer_status_at_booking` at job creation.
 * Historic rows (before the field existed) are `null`.
 */
export type CustomerStatusAtBooking = "new" | "existing";

/** Narrow a raw DB value to the union. */
export const isCustomerStatusAtBooking = (v: unknown): v is CustomerStatusAtBooking =>
  v === "new" || v === "existing";
