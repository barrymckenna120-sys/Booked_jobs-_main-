import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, addDays, addMonths, isToday, isSameWeek, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ViewMode = "day" | "week" | "month";

type Props = {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  anchor: Date;
  onAnchorChange: (d: Date) => void;
};

const options: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function getDateRange(mode: ViewMode, anchor: Date = new Date()): { start: Date; end: Date; label: string } {
  switch (mode) {
    case "day": {
      return {
        start: startOfDay(anchor),
        end: endOfDay(anchor),
        label: format(anchor, "EEEE d MMM yyyy"),
      };
    }
    case "week": {
      const ws = startOfWeek(anchor, { weekStartsOn: 1 });
      const we = endOfWeek(anchor, { weekStartsOn: 1 });
      const sameMonth = ws.getMonth() === we.getMonth();
      return {
        start: ws,
        end: we,
        label: sameMonth
          ? `${format(ws, "d")}–${format(we, "d MMM yyyy")}`
          : `${format(ws, "d MMM")}–${format(we, "d MMM yyyy")}`,
      };
    }
    case "month":
    default: {
      const ms = startOfMonth(anchor);
      const me = endOfMonth(anchor);
      return {
        start: ms,
        end: me,
        label: format(anchor, "MMMM yyyy"),
      };
    }
  }
}

function isCurrentPeriod(mode: ViewMode, anchor: Date): boolean {
  const now = new Date();
  switch (mode) {
    case "day": return isToday(anchor);
    case "week": return isSameWeek(anchor, now, { weekStartsOn: 1 });
    case "month": return isSameMonth(anchor, now);
  }
}

function navigate(mode: ViewMode, anchor: Date, direction: -1 | 1): Date {
  switch (mode) {
    case "day": return addDays(anchor, direction);
    case "week": return addDays(anchor, direction * 7);
    case "month": return addMonths(anchor, direction);
  }
}

const DateRangeToggle = ({ value, onChange, anchor, onAnchorChange }: Props) => {
  const isCurrent = isCurrentPeriod(value, anchor);
  const range = getDateRange(value, anchor);

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">View By</span>
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

      {/* Navigation */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onAnchorChange(navigate(value, anchor, -1))}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold min-w-[120px] text-center">{range.label}</span>
        <button
          onClick={() => onAnchorChange(navigate(value, anchor, 1))}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isCurrent && (
          <button
            onClick={() => onAnchorChange(new Date())}
            className="ml-1 px-2 py-1 text-[10px] font-bold rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Today
          </button>
        )}
      </div>
    </div>
  );
};

export default DateRangeToggle;
