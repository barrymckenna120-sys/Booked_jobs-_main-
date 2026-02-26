import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBackButton } from "@/hooks/useBackButton";
import { format, addDays, subDays, isToday } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, X, Phone, MapPin, Loader2 } from "lucide-react";

interface DayJobsPanelProps {
  date: string;
  onClose: () => void;
}

const STATUS_BORDER: Record<string, string> = {
  Scheduled:     "border-l-primary",
  Booked:        "border-l-primary",
  "En Route":    "border-l-[hsl(var(--chart-4))]",
  "On Site":     "border-l-[hsl(var(--chart-4))]",
  "In Progress": "border-l-warning",
  Completed:     "border-l-success",
  Cancelled:     "border-l-destructive",
  Emergency:     "border-l-[#7C3AED]",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  Scheduled:     { bg: "bg-primary/10",      text: "text-primary" },
  Booked:        { bg: "bg-primary/10",      text: "text-primary" },
  "En Route":    { bg: "bg-warning/10",      text: "text-warning" },
  "On Site":     { bg: "bg-warning/10",      text: "text-warning" },
  "In Progress": { bg: "bg-warning/10",      text: "text-warning" },
  Completed:     { bg: "bg-success/10",      text: "text-success" },
  Cancelled:     { bg: "bg-destructive/10",  text: "text-destructive" },
};

const TIME_LABELS: Record<string, string> = {
  "9–11":  "09:00 – 11:00am",
  "11–2":  "11:00am – 1:00pm",
  "2–5":   "2:00 – 5:00pm",
  morning: "09:00 – 11:00am",
  midday:  "11:00am – 1:00pm",
  afternoon: "2:00 – 5:00pm",
};

const TIME_ORDER: Record<string, number> = {
  "9–11": 1, morning: 1,
  "11–2": 2, midday: 2,
  "2–5": 3, afternoon: 3,
};

const DayJobsPanel = ({ date, onClose }: DayJobsPanelProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(date);
  const stableClose = useCallback(() => onClose(), [onClose]);
  useBackButton(true, stableClose);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["day-jobs-panel", user?.id, currentDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("*, customers!inner(id, name, phone, address, eircode, boiler_make_model)")
        .eq("scheduled_date", currentDate)
        .order("created_at");
      return (data || []).sort(
        (a: any, b: any) => (TIME_ORDER[a.time_block] || 99) - (TIME_ORDER[b.time_block] || 99)
      );
    },
    enabled: !!user && !!currentDate,
  });

  const dateObj = new Date(currentDate + "T00:00:00");
  const displayDate = format(dateObj, "EEEE d MMMM");
  const isCurrent = isToday(dateObj);

  const prevDay = () => setCurrentDate(format(subDays(dateObj, 1), "yyyy-MM-dd"));
  const nextDay = () => setCurrentDate(format(addDays(dateObj, 1), "yyyy-MM-dd"));

  const completed = jobs.filter((j: any) => j.status === "Completed").length;
  const cancelled = jobs.filter((j: any) => j.status === "Cancelled").length;
  const remaining = jobs.length - completed - cancelled;
  const totalRevenue = jobs.reduce((s: number, j: any) => s + (j.revenue || 0), 0);
  const collectedRevenue = jobs
    .filter((j: any) => j.deposit_paid || j.status === "Completed")
    .reduce((s: number, j: any) => s + (j.revenue || 0), 0);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[480px] p-0 flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 pt-5 pb-4">
          <SheetHeader className="mb-0">
            <SheetTitle className="sr-only">Day Jobs</SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevDay}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold">{displayDate}</h2>
                  {isCurrent && (
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Today</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""}
                  {jobs.length > 0 && ` · €${totalRevenue.toLocaleString()} scheduled`}
                </p>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextDay}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && jobs.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📅</div>
              <div className="text-lg font-extrabold mb-1">No jobs scheduled</div>
              <div className="text-sm text-muted-foreground">Nothing booked for this day</div>
            </div>
          )}

          {!isLoading &&
            jobs.map((job: any) => {
              const borderClass = job.job_type === "Emergency"
                ? "border-l-[#7C3AED]"
                : STATUS_BORDER[job.status] || "border-l-primary";
              const statusStyle = STATUS_STYLE[job.status] || STATUS_STYLE.Scheduled;
              const timeLabel = TIME_LABELS[job.time_block] || job.time_block || "—";
              const customer = job.customers;
              const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent((customer?.address || "") + " " + (customer?.eircode || "") + " Ireland")}`;

              return (
                <div
                  key={job.id}
                  className={`bg-card rounded-2xl border border-l-4 border-border/60 ${borderClass} overflow-hidden hover:shadow-md transition-shadow`}
                >
                  {/* Top row */}
                  <div className="flex items-center justify-between px-5 pt-4 pb-1.5">
                    <span className="text-xs font-bold bg-secondary rounded-full px-2.5 py-1">
                      ⏰ {timeLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${statusStyle.bg} ${statusStyle.text}`}>
                        {job.status}
                      </span>
                      <span className={`text-xs font-bold ${job.deposit_paid ? "text-success" : "text-warning"}`}>
                        {job.deposit_paid ? "✅ Paid" : "⏳ Unpaid"}
                      </span>
                    </div>
                  </div>

                  {/* Customer info */}
                  <div className="px-5 py-2.5">
                    <div className="text-[17px] font-extrabold mb-1.5">{customer?.name || "Unknown"}</div>
                    <div className="text-sm text-muted-foreground/70 mb-1">
                      📍 {customer?.address}
                      {customer?.eircode && (
                        <span className="ml-1 text-xs font-mono text-muted-foreground/70">{customer.eircode}</span>
                      )}
                    </div>
                    {customer?.boiler_make_model && (
                      <div className="text-sm text-muted-foreground/70">♨️ {customer.boiler_make_model}</div>
                    )}
                    <div className="text-sm text-muted-foreground mt-1">🔧 {job.job_type}</div>
                  </div>

                  {/* Engineer + price */}
                  <div className="flex items-center justify-between px-5 pb-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold">
                        {job.assigned_engineer?.[0] || "?"}
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {job.assigned_engineer || "Unassigned"}
                      </span>
                    </div>
                    {job.revenue > 0 && (
                      <div className="text-base font-extrabold">€{job.revenue}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2.5 px-5 pb-5">
                    <a
                      href={`tel:${customer?.phone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted/50 transition-colors no-underline text-foreground"
                    >
                      <Phone className="w-3.5 h-3.5" /> Call
                    </a>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-sm font-bold text-primary hover:bg-primary/5 transition-colors no-underline"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Maps
                    </a>
                    <Button
                      className="flex-[2] rounded-xl font-bold"
                      onClick={() => { onClose(); navigate(`/jobs/${job.id}`); }}
                    >
                      View Full Job →
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Summary footer */}
        {jobs.length > 0 && (
          <div className="border-t border-border bg-muted/50 px-5 py-3">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total", value: jobs.length, className: "text-foreground" },
                { label: "Done", value: completed, className: "text-success" },
                { label: "Remaining", value: remaining, className: "text-primary" },
                { label: "Collected", value: `€${collectedRevenue.toLocaleString()}`, className: "text-success" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className={`text-lg font-extrabold ${s.className}`}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default DayJobsPanel;
