import { useState, useEffect } from "react";
import { format, isToday } from "date-fns";
import type { ScheduleJob } from "@/pages/Schedule";
import { Badge } from "@/components/ui/badge";
import { Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import MessageEngineerModal from "@/components/messages/MessageEngineerModal";
import JobConfirmedBadge from "@/components/jobs/JobConfirmedBadge";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";

type Props = {
  weekDays: Date[];
  timeBlocks: string[];
  jobs: ScheduleJob[];
  selectedEngineer: string;
  engineers: { id: string; name: string }[];
  blockMap?: Record<string, string>;
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
      return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0">{type || "Service"}</Badge>;
  }
};

const mediaBadge = (count?: number) => {
  if (!count || count < 1) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0 shrink-0"
      title={`${count} photo${count === 1 ? "" : "s"} / video${count === 1 ? "" : "s"}`}
    >
      <Camera className="w-2.5 h-2.5" /> {count}
    </span>
  );
};

// Normalize time_block using the block map from parent
const normalizeDash = (s: string) => s.replace(/[\u2013\u2014]/g, '-');
const normalizeBlock = (b: string | null, bMap?: Record<string, string>) => {
  if (!b) return null;
  const dashed = normalizeDash(b);
  const normMap: Record<string, string> = {};
  if (bMap) Object.entries(bMap).forEach(([k, v]) => { normMap[normalizeDash(k)] = normalizeDash(v); });
  if (normMap[dashed]) return normMap[dashed];
  const stripped = dashed.replace(/\s*-\s*/g, '-');
  if (normMap[stripped]) return normMap[stripped];
  return dashed;
};

const WeeklyGrid = ({ weekDays, timeBlocks, jobs, selectedEngineer, engineers, blockMap, onCellClick, onJobClick }: Props) => {
  const [messageModal, setMessageModal] = useState<{ open: boolean; jobId: string; engineerName: string; engineerAuthUserId: string | null } | null>(null);
  const [engineerAuthMap, setEngineerAuthMap] = useState<Record<string, string | null>>({});

  // Fetch auth_user_id for all engineers once
  useEffect(() => {
    if (engineers.length === 0) return;
    supabase
      .from("engineers")
      .select("id, auth_user_id")
      .in("id", engineers.map((e) => e.id))
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string | null> = {};
          data.forEach((e) => { map[e.id] = e.auth_user_id; });
          setEngineerAuthMap(map);
        }
      });
  }, [engineers]);

  const getJobsForSlot = (date: Date, timeBlock: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return jobs.filter(
      (j) =>
        j.scheduled_date?.slice(0, 10) === dateStr &&
        normalizeBlock(j.time_block, blockMap) === normalizeDash(timeBlock) &&
        !["New", "Contacted", "Completed", "Cancelled"].includes(j.status) &&
        (selectedEngineer === "all" || j.assigned_engineer === selectedEngineer)
    );
  };

  const handleMessageClick = (e: React.MouseEvent, job: ScheduleJob) => {
    e.stopPropagation();
    const engId = job.assigned_engineer_id;
    const authId = engId ? engineerAuthMap[engId] || null : null;
    setMessageModal({
      open: true,
      jobId: job.id,
      engineerName: job.assigned_engineer || "Engineer",
      engineerAuthUserId: authId,
    });
  };

  const renderMessageBtn = (job: ScheduleJob) => {
    if (!job.assigned_engineer) return null;
    return (
      <button
        onClick={(e) => handleMessageClick(e, job)}
        className="text-[11px] px-2.5 py-[3px] rounded-md border border-[#4A86E8] text-[#4A86E8] bg-white hover:bg-[#4A86E8]/5 transition-colors mt-0.5"
      >
        📩 Message
      </button>
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
                              job.status === "parts_needed" || job.status === "parts_ordered" ? "border-l-[4px] border-l-amber-500"
                              : job.status === "parts_arrived" ? "border-l-[4px] border-l-[#7C3AED]"
                              : job.job_type === "Emergency" ? "border-l-[3px] border-l-destructive"
                              : ["En Route", "On Site", "In Progress"].includes(job.status) ? "border-l-[3px] border-l-warning"
                              : "border-l-[3px] border-l-primary"
                            } bg-card`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold truncate block">{job.customer_name}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <JobConfirmedBadge confirmed={job.confirmed} confirmedAt={job.confirmed_at} status={(job as any).status} size="sm" />
                                  {["En Route", "On Site", "In Progress"].includes(job.status) && (
                                    <span className="text-[9px] font-bold text-warning bg-warning/10 rounded-full px-1.5 py-0.5">
                                      {job.status === "En Route" ? "🚗" : job.status === "On Site" ? "📍" : "⚙️"} {job.status}
                                    </span>
                                  )}
                                  {job.status === "parts_needed" && (
                                    <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 rounded-full px-1.5 py-0.5">
                                      🔧 Parts Needed
                                    </span>
                                  )}
                                  {job.status === "parts_ordered" && (
                                    <span className="text-[9px] font-bold text-blue-600 bg-blue-100 rounded-full px-1.5 py-0.5">
                                      📦 Parts Ordered
                                    </span>
                                  )}
                                  {job.status === "parts_arrived" && (
                                    <span className="text-[9px] font-bold text-[#7C3AED] bg-[#F3E8FF] rounded-full px-1.5 py-0.5">
                                      📅 Awaiting Booking
                                    </span>
                                  )}
                                  {(job.status === "parts_needed" || job.status === "parts_ordered") && job.parts_priority && (
                                    <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                                      job.parts_priority === "urgent" ? "bg-[#FEE2E2] text-[#DC2626]"
                                      : job.parts_priority === "low" ? "bg-[#DCFCE7] text-[#16A34A]"
                                      : "bg-[#FEF3C7] text-[#D97706]"
                                    }`}>
                                      {job.parts_priority === "urgent" ? "🔴" : job.parts_priority === "low" ? "🟢" : "🟡"} {job.parts_priority.charAt(0).toUpperCase() + job.parts_priority.slice(1)}
                                    </span>
                                  )}
                                  {!job.deposit_paid && <span className="w-2 h-2 rounded-full bg-warning shrink-0" title="Unpaid" />}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                {jobTypeBadge(job.job_type)}
                                {mediaBadge(job.media_count)}
                                <NewCustomerBadge status={job.customer_status_at_booking} size="sm" />
                                {job.revenue && <span className="text-muted-foreground">€{job.revenue}</span>}
                              </div>
                              {selectedEngineer === "all" && job.assigned_engineer && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {job.assigned_engineer}
                                  <div>{renderMessageBtn(job)}</div>
                                </div>
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
                        job.status === "parts_needed" || job.status === "parts_ordered" ? "border-l-[4px] border-l-amber-500"
                        : job.status === "parts_arrived" ? "border-l-[4px] border-l-[#7C3AED]"
                        : job.job_type === "Emergency" ? "border-l-[3px] border-l-destructive" : "border-l-[3px] border-l-primary"
                      } bg-card`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block truncate">{job.customer_name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <JobConfirmedBadge confirmed={job.confirmed} confirmedAt={job.confirmed_at} status={(job as any).status} size="sm" />
                            {jobTypeBadge(job.job_type)}
                            {mediaBadge(job.media_count)}
                            <NewCustomerBadge status={job.customer_status_at_booking} size="sm" />
                            {!job.deposit_paid && <span className="w-2 h-2 rounded-full bg-warning" />}
                          </div>
                        </div>
                        {selectedEngineer === "all" && job.assigned_engineer && (
                          <div className="text-[10px] text-muted-foreground">
                            {job.assigned_engineer}
                            <div>{renderMessageBtn(job)}</div>
                          </div>
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

      {/* Message Engineer Modal */}
      {messageModal && (
        <MessageEngineerModal
          open={messageModal.open}
          onOpenChange={(open) => { if (!open) setMessageModal(null); }}
          jobId={messageModal.jobId}
          engineerName={messageModal.engineerName}
          engineerAuthUserId={messageModal.engineerAuthUserId}
        />
      )}
    </>
  );
};

export default WeeklyGrid;
