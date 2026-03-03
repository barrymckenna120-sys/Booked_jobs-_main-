const TIME_LABELS: Record<string, string> = {
  Morning: "9–11am",
  Midday: "11am–2pm",
  Afternoon: "2–5pm",
  morning: "9–11am",
  midday: "11am–2pm",
  afternoon: "2–5pm",
  "9am–11am": "9–11am",
  "11am–1pm": "11am–1pm",
  "2pm–5pm": "2–5pm",
};

export const IncomingStatusPill = ({ status }: { status: string | null }) => {
  const map: Record<string, string> = {
    Pending: "bg-warning/10 text-warning",
    Reviewed: "bg-primary/10 text-primary",
    Assigned: "bg-success/10 text-success",
    Rejected: "bg-destructive/10 text-destructive",
    Archived: "bg-muted text-muted-foreground",
  };
  const s = status || "Pending";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${map[s] || "bg-muted text-muted-foreground"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s}
    </span>
  );
};

export const BoilerWorkingPill = ({ working }: { working: boolean | null }) =>
  working === false ? (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">✗ Not Working</span>
  ) : (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success">✓ Working</span>
  );

export const TimeBlockLabel = ({ block }: { block: string | null }) => {
  if (!block) return null;
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
      ⏰ {TIME_LABELS[block] || block}
    </span>
  );
};

export { TIME_LABELS };
