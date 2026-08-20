import { UserPlus } from "lucide-react";

type Props = {
  /** service_calls.customer_status_at_booking — only 'new' renders the badge. */
  status?: string | null;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Emerald "New Customer" badge. Rendered only when the job was booked for a
 * customer that did not previously exist (customer_status_at_booking === 'new').
 */
const NewCustomerBadge = ({ status, size = "md", className = "" }: Props) => {
  if (status !== "new") return null;
  const text = size === "sm" ? "text-[9px] px-1.5 py-0" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/15 font-semibold text-emerald-600 shrink-0 ${text} ${className}`}
      title="New customer at time of booking"
    >
      <UserPlus className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} strokeWidth={2} />
      New Customer
    </span>
  );
};

export default NewCustomerBadge;
