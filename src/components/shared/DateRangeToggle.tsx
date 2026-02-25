import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";

export type ViewMode = "day" | "week" | "month";

type Props = {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
};

const options: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function getDateRange(mode: ViewMode): { start: Date; end: Date; label: string } {
  const now = new Date();
  switch (mode) {
    case "day": {
      return {
        start: startOfDay(now),
        end: endOfDay(now),
        label: `Today – ${format(now, "d MMM yyyy")}`,
      };
    }
    case "week": {
      const ws = startOfWeek(now, { weekStartsOn: 1 });
      const we = endOfWeek(now, { weekStartsOn: 1 });
      return {
        start: ws,
        end: we,
        label: `This Week – ${format(ws, "d")}–${format(we, "d MMM yyyy")}`,
      };
    }
    case "month":
    default: {
      const ms = startOfMonth(now);
      const me = endOfMonth(now);
      return {
        start: ms,
        end: me,
        label: `This Month – ${format(now, "MMMM yyyy")}`,
      };
    }
  }
}

const DateRangeToggle = ({ value, onChange }: Props) => {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">View By</span>
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 ${
              value === opt.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DateRangeToggle;
