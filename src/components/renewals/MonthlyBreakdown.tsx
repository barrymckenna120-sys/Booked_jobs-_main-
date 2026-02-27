import { useEffect, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CalendarDays } from "lucide-react";
import { format, startOfMonth, addMonths, isSameMonth } from "date-fns";

type Customer = {
  next_service_due: string | null;
  renewal_stage: string | null;
  last_service_date: string | null;
};

type Props = {
  customers: Customer[];
  servicePrice: number;
};

const MonthlyBreakdown = ({ customers, servicePrice }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  useEffect(() => {
    if (currentMonthRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const card = currentMonthRef.current;
      const offset = card.offsetLeft - container.offsetLeft - 16;
      container.scrollTo({ left: offset, behavior: "smooth" });
    }
  }, []);

  const months = useMemo(() => {
    const result = [];
    // Show 6 months back + current + 5 forward = 12
    const startMonth = addMonths(startOfMonth(now), -3);

    for (let i = 0; i < 12; i++) {
      const month = addMonths(startMonth, i);
      const isCurrent = isSameMonth(month, now);
      const isPast = month < startOfMonth(now);

      const dueCustomers = customers.filter(c => {
        if (!c.next_service_due) return false;
        return isSameMonth(new Date(c.next_service_due), month);
      });

      const due = dueCustomers.length;
      const booked = dueCustomers.filter(c => ["booked", "confirmed", "paid"].includes(c.renewal_stage || "")).length;
      const done = dueCustomers.filter(c => c.renewal_stage === "paid").length;
      const bookedPct = due > 0 ? Math.round((booked / due) * 100) : 0;
      const bookedValue = booked * servicePrice;
      const grossValue = due * servicePrice;
      const toChase = due - booked;

      let badgeText = "";
      let badgeClass = "";
      if (isPast) {
        badgeText = `${done} completed`;
        badgeClass = "bg-muted text-muted-foreground";
      } else if (toChase === 0 && due > 0) {
        badgeText = "Fully booked";
        badgeClass = "bg-success/10 text-success";
      } else if (toChase > 0) {
        badgeText = `${toChase} to chase`;
        badgeClass = "bg-warning/10 text-warning";
      }

      let progressColor = "";
      if (bookedPct >= 100) progressColor = "bg-success";
      else if (bookedPct >= 60) progressColor = "bg-primary";
      else if (bookedPct >= 30) progressColor = "bg-warning";
      else progressColor = "bg-destructive";

      result.push({
        month,
        label: format(month, "MMM yyyy"),
        shortLabel: format(month, "MMM"),
        isCurrent,
        isPast,
        due,
        booked,
        done,
        bookedPct,
        bookedValue,
        grossValue,
        badgeText,
        badgeClass,
        progressColor,
        toChase,
      });
    }
    return result;
  }, [customers, servicePrice, now]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Monthly Breakdown</h3>
      </div>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scroll-smooth">
        {months.map((m) => (
          <div
            key={m.label}
            ref={m.isCurrent ? currentMonthRef : undefined}
            className={`shrink-0 w-[170px] rounded-xl border p-3.5 transition-all ${
              m.isPast
                ? "opacity-50 border-border/40 bg-muted/30"
                : m.isCurrent
                ? "border-primary/40 bg-primary/5 shadow-sm"
                : m.toChase > 0 && !m.isPast
                ? "border-warning/30 bg-warning/5"
                : "border-border/60 bg-card"
            }`}
          >
            {/* Month name */}
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className={`text-xs font-bold ${m.isCurrent ? "text-primary" : "text-foreground"}`}>
                {m.shortLabel}
              </span>
              {m.isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              <span className="text-[10px] text-muted-foreground/60">{format(m.month, "yyyy")}</span>
            </div>

            {m.due === 0 ? (
              <p className="text-[11px] text-muted-foreground/50 py-2">No renewals</p>
            ) : (
              <>
                {/* Stats */}
                <div className="space-y-1.5 mb-2.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Due</span>
                    <span className="font-bold text-foreground">{m.due}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Booked</span>
                    <span className={`font-bold ${
                      m.bookedPct >= 100 ? "text-success" :
                      m.bookedPct >= 60 ? "text-primary" :
                      m.bookedPct >= 30 ? "text-warning" :
                      "text-destructive"
                    }`}>{m.booked}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Done</span>
                    <span className="font-bold text-[#8B5CF6]">{m.done}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-border overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${m.progressColor}`}
                    style={{ width: `${Math.min(m.bookedPct, 100)}%` }}
                  />
                </div>

                {/* Value */}
                <div className="text-[11px] mb-2">
                  <span className="font-bold text-success">€{m.bookedValue.toLocaleString()}</span>
                  <span className="text-muted-foreground/60"> / €{m.grossValue.toLocaleString()}</span>
                </div>

                {/* Badge */}
                {m.badgeText && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.badgeClass}`}>
                    {m.badgeText}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthlyBreakdown;
