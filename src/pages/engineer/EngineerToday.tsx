import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Loader2, ClipboardList, CheckCircle2, XCircle, Car, MapPin, Wrench, PartyPopper, Briefcase, Package, AlertTriangle, ChevronRight } from "lucide-react";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import EngineerCompactJobRow from "@/components/engineer/EngineerCompactJobRow";

import EngineerOutstandingBalances from "@/components/engineer/EngineerOutstandingBalances";
import { getNextJobId, type EngineerJobsState } from "@/hooks/useEngineerJobs";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
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
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAccessOffice } = useUserRole(user);
  const { todayActive, todayPaidNeedsCompletion, todayCancelled, todayInProgress, completedJobs, customers, loading, updateJob, fadingJobIds } = useOutletContext<EngineerJobsState>();
  const todayKey = new Date().toISOString().split("T")[0];
  const completedTodayCount = completedJobs.filter((job: any) =>
    job.scheduled_date === todayKey || job.completed_at?.slice(0, 10) === todayKey
  ).length;

  const nextJobId = getNextJobId(todayActive);
  const sortedActive = nextJobId
    ? [todayActive.find((j: any) => j.id === nextJobId), ...todayActive.filter((j: any) => j.id !== nextJobId)]
    : todayActive;

  const [openPartsCount, setOpenPartsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data: engRow } = await supabase
          .from("engineers")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        const filters = [
          `engineer_id.eq.${user.id}`,
          `assigned_engineer_id.eq.${user.id}`,
        ];
        const engineerRowId = (engRow as any)?.id;
        if (engineerRowId) filters.push(`assigned_to.eq.${engineerRowId}`);

        const { count, error } = await supabase
          .from("parts_requests" as any)
          .select("id", { count: "exact", head: true })
          .or(filters.join(","))
          .eq("status", "Open");

        if (cancelled) return;
        if (error) {
          setOpenPartsCount(0);
          return;
        }
        setOpenPartsCount(count ?? 0);
      } catch {
        if (!cancelled) setOpenPartsCount(0);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <>
      {/* In progress banner */}
      {todayInProgress.length > 0 && (() => {
        const ProgressIcon = IN_PROGRESS_ICON[todayInProgress[0].status] || Wrench;
        return (
          <div className="bg-warning/10 border border-warning/40 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-warning flex items-center justify-center shrink-0">
              <ProgressIcon className="w-5 h-5 text-warning-foreground" />
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-warning">{todayInProgress[0].status}</div>
              <div className="text-xs text-muted-foreground/70 mt-1">
                {customers[todayInProgress[0].customer_id]?.name} · {todayInProgress[0].time_block}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Today's Jobs — primary focus */}
      <div className="flex justify-between items-center">
        <div className="text-lg font-extrabold text-foreground">Today's Jobs</div>
        <span className="bg-primary/10 text-primary rounded-full px-3.5 py-1 text-xs font-bold">{todayActive.length} left</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {todayActive.length === 0 && todayPaidNeedsCompletion.length === 0 && completedTodayCount === 0 && todayCancelled.length === 0 && (
            <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <div className="text-lg font-extrabold text-foreground mb-1.5">No jobs scheduled today</div>
              <div className="text-sm text-muted-foreground/70 mb-5">Check back tomorrow or contact the office.</div>
              <button onClick={() => navigate("/engineer/upcoming")} className="text-sm font-bold text-primary underline underline-offset-2">
                View Upcoming →
              </button>
            </div>
          )}

          {todayActive.length === 0 && todayPaidNeedsCompletion.length === 0 && completedTodayCount > 0 && (
            <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
              <PartyPopper className="w-12 h-12 mx-auto mb-3 text-success" />
              <div className="text-lg font-extrabold text-foreground mb-1.5">All jobs completed for today.</div>
              <div className="text-sm text-muted-foreground/70">{completedTodayCount} job{completedTodayCount > 1 ? "s" : ""} completed today.</div>
            </div>
          )}

          {sortedActive.length > 0 && (
            <EngineerJobCard
              key={sortedActive[0].id}
              job={sortedActive[0]}
              customer={customers[sortedActive[0].customer_id] || {}}
              onUpdate={updateJob}
              isNextJob={sortedActive[0].id === nextJobId}
            />
          )}

          {sortedActive.length > 1 && (
            <>
              <SectionDivider label="REST OF DAY" />
              {sortedActive.slice(1).map((job: any) => (
                <EngineerCompactJobRow key={job.id} job={job} customer={customers[job.customer_id] || {}} />
              ))}
            </>
          )}

          {todayPaidNeedsCompletion.length > 0 && (
            <>
              <SectionDivider label="PAID — NEEDS COMPLETION" />
              <p className="text-[11px] text-muted-foreground/70 text-center -mt-1 mb-1">
                Payment taken. Still fill in the Complete form to close the job.
              </p>
              {todayPaidNeedsCompletion.map((job: any) => (
                <EngineerCompactJobRow key={job.id} job={job} customer={customers[job.customer_id] || {}} />
              ))}
            </>
          )}


          {todayCancelled.length > 0 && (
            <>
              <SectionDivider label="CANCELLED" />
              {todayCancelled.map((job: any) => (
                <div
                  key={job.id}
                  className={`transition-all duration-[3000ms] ease-in-out ${
                    fadingJobIds.has(job.id) ? "opacity-0 scale-95 max-h-0 overflow-hidden" : "opacity-100 scale-100"
                  }`}
                >
                  <EngineerCompactJobRow job={job} customer={customers[job.customer_id] || {}} />
                </div>
              ))}
            </>
          )}

        </>
      )}

      {/* Job Stats */}
      <div className="flex gap-4">
        {([
          { count: todayActive.length, label: "Scheduled", Icon: ClipboardList, borderColor: "border-t-primary", iconColor: "text-primary" },
          { count: completedTodayCount, label: "Completed", Icon: CheckCircle2, borderColor: "border-t-success", iconColor: "text-success" },
          { count: todayCancelled.length, label: "Cancelled", Icon: XCircle, borderColor: "border-t-destructive", iconColor: "text-destructive" },
        ] as const).map((stat) => (
          <div key={stat.label} className={`flex-1 bg-card rounded-2xl border border-border/60 ${stat.borderColor} border-t-4 p-5 text-center shadow-sm`}>
            <stat.Icon className={`w-5 h-5 mx-auto mb-2 ${stat.iconColor}`} />
            <div className="text-3xl font-black tracking-tighter leading-none mb-1.5">{stat.count}</div>
            <div className="text-[11px] font-semibold text-muted-foreground/70 leading-snug">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Outstanding Balances — slim banner */}
      <EngineerOutstandingBalances />

      {openPartsCount !== null && openPartsCount > 0 && (
        <div className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden">
          <div className="bg-warning/10 px-5 py-3 border-b border-warning/20">
            <h3 className="text-sm font-bold text-warning flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Needs Attention
            </h3>
          </div>
          <button
            onClick={() => navigate("/engineer/parts")}
            className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-secondary/50 transition-colors text-left group"
          >
            <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold font-mono text-foreground leading-none">{openPartsCount}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Parts Awaiting</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        </div>
      )}

      {canAccessOffice && (
        <button
          onClick={() => navigate("/dashboard")}
          className="mx-4 mb-4 flex items-center justify-center gap-2 bg-[#2563EB] text-white rounded-xl py-4 text-base font-semibold hover:bg-[#1d4ed8] transition-colors"
        >
          <Briefcase className="h-5 w-5" />
          Switch to Office App
        </button>
      )}
    </>
  );
};

export default EngineerToday;
