import { format, isToday } from "date-fns";
import type { ScheduleJob } from "@/pages/Schedule";
import { Badge } from "@/components/ui/badge";

type Props = {
  weekDays: Date[];
  timeBlocks: string[];
  jobs: ScheduleJob[];
  selectedEngineer: string;
  engineers: { id: string; name: string }[];
  onCellClick: (date: Date, timeBlock: string) => void;
  onJobClick: (job: ScheduleJob) => void;
};

const jobTypeBadge = (type: string) => {
  switch (type) {
    case "Repair":
      return <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px] px-1.5 py-0">Repair</Badge>;
    case "Emergency":
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0">Emergency</Badge>;
    default:
      return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0">Service</Badge>;
  }
};

// Normalize all time_block variants to canonical form for matching
const BLOCK_MAP: Record<string, string> = {
  "9–11": "9am–11am", "9-11": "9am–11am", "morning": "9am–11am", "Morning": "9am–11am", "9am–11am": "9am–11am",
  "11–2": "11am–1pm", "11-2": "11am–1pm", "midday": "11am–1pm", "Midday": "11am–1pm", "11am–1pm": "11am–1pm",
  "2–5": "2pm–5pm", "2-5": "2pm–5pm", "afternoon": "2pm–5pm", "Afternoon": "2pm–5pm", "2pm–5pm": "2pm–5pm",
};
const normalizeBlock = (b: string | null) => (b ? BLOCK_MAP[b] || b : null);

const WeeklyGrid = ({ weekDays, timeBlocks, jobs, selectedEngineer, engineers, onCellClick, onJobClick }: Props) => {

  const getJobsForSlot = (date: Date, timeBlock: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return jobs.filter(
      (j) =>
        j.scheduled_date === dateStr &&
        normalizeBlock(j.time_block) === timeBlock &&
        !["New", "Contacted", "Completed", "Cancelled"].includes(j.status) &&
        (selectedEngineer === "all" || j.assigned_engineer === selectedEngineer)
    );
  };

  return (
    <>
      {/* Desktop Grid */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-24 text-xs text-muted-foreground font-semibold p-2 text-left">Time</th>
              {weekDays.map((day) => (
                <th
                  key={day.toISOString()}
                  className={`text-xs font-semibold p-2 text-center border-l border-border ${isToday(day) ? "bg-primary/5" : ""}`}
                >
                  <div className="text-muted-foreground">{format(day, "EEE")}</div>
                  <div className={`text-sm ${isToday(day) ? "text-primary font-bold" : "text-foreground"}`}>{format(day, "d MMM")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeBlocks.map((block) => (
              <tr key={block} className="border-t border-border">
                <td className="text-xs text-muted-foreground font-medium p-2 align-top whitespace-nowrap">{block}</td>
                {weekDays.map((day) => {
                  const slotJobs = getJobsForSlot(day, block);
                  return (
                    <td
                      key={`${day.toISOString()}-${block}`}
                      className={`border-l border-border p-1.5 align-top min-h-[80px] h-20 ${isToday(day) ? "bg-primary/5" : ""}`}
                    >
                      {slotJobs.length > 0 ? (
                        <div className="space-y-1">
                          {slotJobs.map((job) => (
                            <button
                              key={job.id}
                              onClick={() => onJobClick(job)}
                              className={`w-full text-left rounded-md border p-2 text-xs transition-colors hover:shadow-sm cursor-pointer ${
                                job.job_type === "Emergency" ? "border-l-[3px] border-l-destructive"
                                : ["En Route", "On Site", "In Progress"].includes(job.status) ? "border-l-[3px] border-l-warning"
                                : "border-l-[3px] border-l-primary"
                              } bg-card`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold truncate">{job.customer_name}</span>
                                <div className="flex items-center gap-1">
                                  {["En Route", "On Site", "In Progress"].includes(job.status) && (
                                    <span className="text-[9px] font-bold text-warning bg-warning/10 rounded-full px-1.5 py-0.5">
                                      {job.status === "En Route" ? "🚗" : job.status === "On Site" ? "📍" : "⚙️"} {job.status}
                                    </span>
                                  )}
                                  {!job.deposit_paid && <span className="w-2 h-2 rounded-full bg-warning shrink-0" title="Unpaid" />}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                {jobTypeBadge(job.job_type)}
                                {job.revenue && <span className="text-muted-foreground">€{job.revenue}</span>}
                              </div>
                              {selectedEngineer === "all" && job.assigned_engineer && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">{job.assigned_engineer}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => onCellClick(day, block)}
                          className="w-full h-full min-h-[60px] rounded-md border border-dashed border-border/60 flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/50 hover:border-primary/30 transition-colors"
                        >
                          + Assign
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Stack days vertically */}
      <div className="md:hidden space-y-4">
        {weekDays.map((day) => (
          <div key={day.toISOString()} className={`rounded-lg border border-border overflow-hidden ${isToday(day) ? "border-primary/40" : ""}`}>
            <div className={`px-3 py-2 text-sm font-semibold ${isToday(day) ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
              {format(day, "EEEE, d MMM")}
            </div>
            {timeBlocks.map((block) => {
              const slotJobs = getJobsForSlot(day, block);
              return (
                <div key={block} className="border-t border-border px-3 py-2">
                  <div className="text-[10px] text-muted-foreground font-semibold mb-1">{block}</div>
                  {slotJobs.length > 0 ? (
                    slotJobs.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => onJobClick(job)}
                        className={`w-full text-left rounded-md border p-2 text-xs mb-1 ${
                          job.job_type === "Emergency" ? "border-l-[3px] border-l-destructive" : "border-l-[3px] border-l-primary"
                        } bg-card`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{job.customer_name}</span>
                          <div className="flex items-center gap-1">
                            {jobTypeBadge(job.job_type)}
                            {!job.deposit_paid && <span className="w-2 h-2 rounded-full bg-warning" />}
                          </div>
                        </div>
                        {selectedEngineer === "all" && job.assigned_engineer && (
                          <div className="text-[10px] text-muted-foreground">{job.assigned_engineer}</div>
                        )}
                      </button>
                    ))
                  ) : (
                    <button
                      onClick={() => onCellClick(day, block)}
                      className="w-full py-3 rounded-md border border-dashed border-border/60 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      + Assign
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
};

export default WeeklyGrid;
