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
  };
};

