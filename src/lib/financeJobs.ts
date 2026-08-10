import { supabase } from "@/integrations/supabase/client";
import type { FinanceJob } from "@/lib/financeMetrics";

export type DashboardJob = FinanceJob & {
  id: string;
  customer_id?: string | null;
  job_reference?: string | null;
};

const dayEnd = (day: string) => `${day}T23:59:59.999Z`;
const dayStart = (day: string) => `${day}T00:00:00.000Z`;

/**
 * Jobs whose revenue OR completion could fall inside [start, end].
 * revenueDate() falls back paid_at → completed_at → scheduled_date, so all three
 * columns have to be considered — filtering on scheduled_date alone hides
 * payments taken today on jobs scheduled for another day.
 */
export async function fetchFinanceJobs(start: string, end: string): Promise<DashboardJob[]> {
  const { data, error } = await supabase
    .from("service_calls")
    .select(
      "id, job_type, revenue, balance_due, deposit_amount, payment_method, payment_status, status, customer_id, job_reference, paid_at, completed_at, scheduled_date",
    )
    .or(
      [
        `and(paid_at.gte.${dayStart(start)},paid_at.lte.${dayEnd(end)})`,
        `and(completed_at.gte.${dayStart(start)},completed_at.lte.${dayEnd(end)})`,
        `and(scheduled_date.gte.${start},scheduled_date.lte.${end})`,
      ].join(","),
    );

  if (error) throw error;
  return (data || []) as DashboardJob[];
}
