/** Pure parts helpers — no Supabase client import, safe to unit test. */
export const PART_STATUSES = ["Open", "Ordered", "Ready to Fit", "Cancelled"] as const;
export type PartStatus = (typeof PART_STATUSES)[number];

export const PART_PRIORITIES = ["urgent", "normal", "low"] as const;
export type PartPriority = (typeof PART_PRIORITIES)[number];

export const ACTIVE_PART_STATUSES: PartStatus[] = ["Open", "Ordered", "Ready to Fit"];

export interface PartLineInput {
  description: string;
  priority: PartPriority;
  quantity?: number;
}

export interface PartsRequestRow {
  id: string;
  service_call_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_phone: string | null;
  organisation_id: string;
  description: string;
  quantity: number;
  priority: string;
  status: string;
  notes: string | null;
  logged_by: string | null;
  logged_by_name: string | null;
  assigned_to: string | null;
  engineer_id: string | null;
  assigned_engineer_id: string | null;
  cancelled_by: string | null;

  ordered_at: string | null;
  ready_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Job statuses the parts sync may overwrite. Mirrors
 * public.recompute_job_parts_status() in the database — keep both in step.
 */
export const PARTS_OVERWRITABLE_JOB_STATUSES = [
  "Pending",
  "Scheduled",
  "Booked",
  "parts_needed",
  "parts_ordered",
  "parts_arrived",
];

const PARTS_JOB_STATUSES = ["parts_needed", "parts_ordered", "parts_arrived"];

/**
 * Pure mirror of the database trigger, used for tests and for optimistic UI.
 * Returns the job status that should result from the given part statuses, or
 * null when the job status must be left exactly as it is.
 */
export const deriveJobStatusFromParts = (
  currentJobStatus: string | null | undefined,
  partStatuses: string[],
  hasScheduledDate = false,
): string | null => {
  if (!currentJobStatus) return null;
  if (!PARTS_OVERWRITABLE_JOB_STATUSES.includes(currentJobStatus)) return null;

  const active = partStatuses.filter((s) => ACTIVE_PART_STATUSES.includes(s as PartStatus));

  let next: string;
  if (active.includes("Open")) next = "parts_needed";
  else if (active.includes("Ordered")) next = "parts_ordered";
  else if (active.includes("Ready to Fit")) next = "parts_arrived";
  else if (PARTS_JOB_STATUSES.includes(currentJobStatus)) next = hasScheduledDate ? "Booked" : "Pending";
  else return null;

  return next === currentJobStatus ? null : next;
};

export const priorityRank = (priority: string | null | undefined): number => {
  const order: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
  return order[priority ?? ""] ?? 99;
};

export const PART_PRIORITY_CONFIG: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  urgent: { emoji: "🔴", label: "Urgent", bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
  normal: { emoji: "🟡", label: "Normal", bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  low: { emoji: "🟢", label: "Low", bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
};

export const PART_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  Open: { label: "Open", bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  Ordered: { label: "Ordered", bg: "bg-blue-100", text: "text-blue-600" },
  "Ready to Fit": { label: "Ready to Fit", bg: "bg-[#F3E8FF]", text: "text-[#7C3AED]" },
  Cancelled: { label: "Cancelled", bg: "bg-muted", text: "text-muted-foreground" },
};

export interface BuildPartsRowArgs {
  part: PartLineInput;
  organisationId: string;
  serviceCallId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  loggedBy?: string | null;
  loggedByName?: string | null;
  assignedTo?: string | null;
  /**
   * Notify target for office-side updates. Defaults to `loggedBy` (engineer
   * path: the engineer who logged it hears back). Office-logged requests pass
   * the assigned engineer's auth id, or null when the job has no engineer.
   */
  engineerId?: string | null;
}


/** Builds the insert payload for a single part request (one request = one part). */
export const buildPartsRequestRow = ({
  part,
  organisationId,
  serviceCallId = null,
  customerId = null,
  customerName = null,
  customerAddress = null,
  customerPhone = null,
  loggedBy = null,
  loggedByName = null,
  assignedTo = null,
}: BuildPartsRowArgs) => {
  const description = (part.description ?? "").trim();
  if (description.length === 0) return null;
  return {
    service_call_id: serviceCallId,
    customer_id: customerId,
    customer_name: customerId ? null : customerName,
    customer_address: customerId ? null : customerAddress,
    customer_phone: customerId ? null : customerPhone,
    organisation_id: organisationId,
    description,
    quantity: part.quantity && part.quantity > 0 ? Math.floor(part.quantity) : 1,
    priority: part.priority,
    status: "Open" as const,
    logged_by: loggedBy,
    logged_by_name: loggedByName,
    assigned_to: assignedTo,
    // The requesting user is the notify target for office updates — the
    // notification trigger reads engineer_id / assigned_engineer_id, so this
    // must be written at insert time or the engineer never hears back.
    engineer_id: loggedBy,
  };
};


/**
 * Icon key per part status. Kept as strings so this module stays pure and
 * unit-testable; the card maps each key to a lucide component.
 *
 * "Ready to Fit" deliberately uses a box-with-tick glyph (PackageCheck) rather
 * than CheckCircle2 — that one marks a job Complete elsewhere in the app and
 * must never read as the same state as a part arriving.
 */
export const PART_STATUS_ICON_KEY: Record<PartStatus, string> = {
  Open: "Clock",
  Ordered: "Truck",
  "Ready to Fit": "PackageCheck",
  Cancelled: "XCircle",
};

/**
 * Mirrors the RLS clause parts_requests_update_own_open_engineer_id: an engineer
 * may only cancel their own request while it is still Open. Keep both in step —
 * offering the control on any other row hands the user a write RLS will reject.
 */
export const canEngineerCancelPart = (
  row: { status?: string | null; engineer_id?: string | null; assigned_engineer_id?: string | null },
  userId: string | null | undefined,
): boolean => {
  if (!userId) return false;
  if (row.status !== "Open") return false;
  return row.engineer_id === userId || row.assigned_engineer_id === userId;
};


/** Tolerance for insert timestamp jitter — updated_at is set by the same statement. */
export const OFFICE_UPDATE_TOLERANCE_MS = 3000;

/**
 * Heuristic: was this request touched by office after the engineer logged it?
 *
 * KNOWN LIMITATION — this infers authorship from timestamps and status because
 * parts_requests has no record of who wrote `notes`. It cannot tell an office
 * note edit apart from an office status change that left `notes` untouched; both
 * read as "Update from office". A notes_updated_by column would make it exact.
 */
export const isOfficeUpdate = (row: {
  created_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
}): boolean => {
  if (!row.created_at || !row.updated_at) return false;
  if (row.status === "Open") return false;
  const created = new Date(row.created_at).getTime();
  const updated = new Date(row.updated_at).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return false;
  return updated - created > OFFICE_UPDATE_TOLERANCE_MS;
};
