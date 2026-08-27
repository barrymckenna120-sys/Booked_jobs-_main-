const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Scheduled:      { color: "text-primary",     bg: "bg-primary/10",     label: "Scheduled" },
  Booked:         { color: "text-primary",     bg: "bg-primary/10",     label: "Booked" },
  "En Route":     { color: "text-warning",     bg: "bg-warning/10",     label: "En Route" },
  "On Site":      { color: "text-warning",     bg: "bg-warning/10",     label: "On Site" },
  "In Progress":  { color: "text-warning",     bg: "bg-warning/10",     label: "In Progress" },
  Completed:      { color: "text-success",     bg: "bg-success/10",     label: "Completed" },
  Cancelled:      { color: "text-destructive", bg: "bg-destructive/10", label: "Cancelled" },
  no_show:        { color: "text-destructive", bg: "bg-destructive/10", label: "No Show" },
  parts_needed:   { color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Parts Needed" },
  parts_ordered:  { color: "text-blue-600",    bg: "bg-blue-100",       label: "Parts Ordered" },
  // BJ-0078 — engineer-facing copy only. Office surfaces keep "Awaiting Booking"
  // (correct for the notify-customer/rebook flow that also writes this status).
  parts_arrived:  { color: "text-[#7C3AED]",   bg: "bg-[#F3E8FF]",      label: "Parts Ready to Fit" },
};

export const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] || STATUS_CONFIG.Scheduled;

const StatusBadge = ({ status }: { status: string }) => {
  const s = getStatusConfig(status);
  return (
    <span className={`${s.bg} ${s.color} rounded-full px-3 py-0.5 text-[11px] font-bold shrink-0 ml-2`}>
      {s.label}
    </span>
  );
};

export default StatusBadge;
