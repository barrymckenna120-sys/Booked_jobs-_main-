const statusStyles: Record<string, string> = {
  Overdue: "bg-destructive/10 text-destructive",
  "Due Soon": "bg-warning/10 text-warning",
  "Up to Date": "bg-success/10 text-success",
};

export const RenewalStatusPill = ({ status }: { status: string }) => {
  const cls = statusStyles[status] || statusStyles["Up to Date"];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
};

export const DaysPill = ({ days }: { days: number }) => {
  if (days < 0)
    return (
      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
        {Math.abs(days)}d overdue
      </span>
    );
  if (days <= 14)
    return (
      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-warning/10 text-warning">
        {days}d left
      </span>
    );
  return (
    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
      {days}d left
    </span>
  );
};
