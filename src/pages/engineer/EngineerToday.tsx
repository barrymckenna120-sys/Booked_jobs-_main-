import { useNavigate } from "react-router-dom";
import { Loader2, ClipboardList, CheckCircle2, XCircle, Car, MapPin, Wrench, PartyPopper } from "lucide-react";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import { useEngineerJobs, getNextJobId } from "@/hooks/useEngineerJobs";
import type { LucideIcon } from "lucide-react";

const SectionDivider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2.5 my-2">
    <div className="flex-1 h-px bg-border" />
    <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
    <div className="flex-1 h-px bg-border" />
  </div>
);

const IN_PROGRESS_ICON: Record<string, LucideIcon> = {
  "En Route": Car,
  "On Site": MapPin,
};

const EngineerToday = () => {
  const navigate = useNavigate();
  const { todayActive, todayCompleted, todayCancelled, todayInProgress, customers, loading, updateJob } = useEngineerJobs();

  const nextJobId = getNextJobId(todayActive);
  const sortedActive = nextJobId
    ? [todayActive.find((j: any) => j.id === nextJobId), ...todayActive.filter((j: any) => j.id !== nextJobId)]
    : todayActive;

  return (
    <>
      {/* Stat blocks */}
      <div className="flex gap-3">
        {([
          { count: todayActive.length, label: "Scheduled", Icon: ClipboardList, borderColor: "border-t-primary", iconColor: "text-primary" },
          { count: todayCompleted.length, label: "Completed", Icon: CheckCircle2, borderColor: "border-t-success", iconColor: "text-success" },
          { count: todayCancelled.length, label: "Cancelled", Icon: XCircle, borderColor: "border-t-destructive", iconColor: "text-destructive" },
        ] as const).map((stat) => (
          <div key={stat.label} className={`flex-1 bg-card rounded-2xl border border-border ${stat.borderColor} border-t-4 p-4 text-center shadow-sm`}>
            <stat.Icon className={`w-5 h-5 mx-auto mb-1.5 ${stat.iconColor}`} />
            <div className="text-3xl font-black tracking-tighter leading-none mb-1">{stat.count}</div>
            <div className="text-[11px] font-semibold text-muted-foreground leading-snug">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* In progress banner */}
      {todayInProgress.length > 0 && (() => {
        const ProgressIcon = IN_PROGRESS_ICON[todayInProgress[0].status] || Wrench;
        return (
          <div className="bg-warning/10 border border-warning rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning flex items-center justify-center shrink-0">
              <ProgressIcon className="w-5 h-5 text-warning-foreground" />
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-warning">{todayInProgress[0].status}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {customers[todayInProgress[0].customer_id]?.name} · {todayInProgress[0].time_block}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Heading */}
      <div className="flex justify-between items-center">
        <div className="text-[17px] font-extrabold text-foreground">Today's Jobs</div>
        <span className="bg-primary/10 text-primary rounded-full px-3 py-0.5 text-xs font-bold">{todayActive.length} left</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {todayActive.length === 0 && todayCompleted.length === 0 && todayCancelled.length === 0 && (
            <div className="text-center py-12 bg-card rounded-2xl border border-border">
              <ClipboardList className="w-12 h-12 mx-auto mb-2.5 text-muted-foreground" />
              <div className="text-lg font-extrabold text-foreground mb-1">No jobs scheduled today</div>
              <div className="text-sm text-muted-foreground mb-4">Check back tomorrow or contact the office.</div>
              <button onClick={() => navigate("/engineer/upcoming")} className="text-sm font-bold text-primary underline underline-offset-2">
                View Upcoming →
              </button>
            </div>
          )}

          {todayActive.length === 0 && todayCompleted.length > 0 && (
            <div className="text-center py-12 bg-card rounded-2xl border border-border">
              <PartyPopper className="w-12 h-12 mx-auto mb-2.5 text-success" />
              <div className="text-lg font-extrabold text-foreground mb-1">All jobs completed for today.</div>
              <div className="text-sm text-muted-foreground">{todayCompleted.length} job{todayCompleted.length > 1 ? "s" : ""} completed today.</div>
            </div>
          )}

          {sortedActive.map((job: any) => (
            <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} isNextJob={job.id === nextJobId} />
          ))}

          {todayCompleted.length > 0 && (
            <>
              <SectionDivider label="COMPLETED" />
              {todayCompleted.map((job: any) => (
                <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
              ))}
            </>
          )}

          {todayCancelled.length > 0 && (
            <>
              <SectionDivider label="CANCELLED" />
              {todayCancelled.map((job: any) => (
                <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
};

export default EngineerToday;
