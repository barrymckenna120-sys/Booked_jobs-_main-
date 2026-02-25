import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";

const TIME_ORDER: Record<string, number> = { "9–11": 1, "11–2": 2, "2–5": 3 };

const getDayName = () =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

const getDateStr = () => {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const todayISO = () => new Date().toISOString().split("T")[0];

const EngineerApp = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: jobsData } = await supabase
      .from("service_calls")
      .select("*")
      .eq("scheduled_date", todayISO())
      .order("created_at");

    if (jobsData) {
      setJobs(jobsData);
      // Fetch related customers
      const customerIds = [...new Set(jobsData.map((j: any) => j.customer_id))];
      if (customerIds.length > 0) {
        const { data: custData } = await supabase
          .from("customers")
          .select("*")
          .in("id", customerIds);
        if (custData) {
          const map: Record<string, any> = {};
          custData.forEach((c: any) => { map[c.id] = c; });
          setCustomers(map);
        }
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchJobs();
  }, [user, fetchJobs]);

  const updateJob = async (jobId: string, patch: Record<string, any>) => {
    // Separate DB fields from UI-only fields
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, cancelReason, cancelNote, ...rest } = patch;

    // Build notes from completion/cancel data
    let notesUpdate = rest.notes;
    if (workDone) {
      notesUpdate = `Work done: ${workDone}${parts ? `\nParts: ${parts}` : ""}${officeNote ? `\nOffice note: ${officeNote}` : ""}${followUp ? `\nFollow-up: ${followUpNote}` : ""}`;
    }
    if (cancelReason) {
      notesUpdate = `Cancelled: ${cancelReason}${cancelNote ? `\nNote: ${cancelNote}` : ""}`;
    }

    const dbPatch: Record<string, any> = { ...rest };
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;

    const { error } = await supabase
      .from("service_calls")
      .update(dbPatch)
      .eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...dbPatch } : j)));
      toast({ title: patch.status === "Completed" ? "Job completed ✔" : patch.status === "Cancelled" ? "Job cancelled" : "Updated" });
    }
  };

  const sortByTime = (arr: any[]) =>
    [...arr].sort((a, b) => (TIME_ORDER[a.time_block] || 99) - (TIME_ORDER[b.time_block] || 99));

  const scheduled = sortByTime(jobs.filter((j) => j.status === "Scheduled"));
  const inProgress = sortByTime(jobs.filter((j) => j.status === "In Progress"));
  const completed = sortByTime(jobs.filter((j) => j.status === "Completed"));
  const cancelled = sortByTime(jobs.filter((j) => j.status === "Cancelled"));
  const active = [...inProgress, ...scheduled];

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-secondary">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-5 pt-12 pb-7 relative overflow-hidden">
        <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-white/[0.07] pointer-events-none" />
        <div className="absolute -bottom-14 right-12 w-36 h-36 rounded-full bg-white/[0.05] pointer-events-none" />

        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg">🔥</div>
          <span className="text-white/80 text-sm font-semibold">Karl's Gas</span>
        </div>

        <div className="text-[13px] text-white/70 font-medium mb-1">
          {getDayName()} · {getDateStr()}
        </div>
        <div className="text-[28px] font-extrabold text-white tracking-tight leading-tight mb-1.5">
          {greeting()},<br />Karl 👋
        </div>
        <div className="text-[13px] text-white/75 font-medium">
          {active.length > 0
            ? `${active.length} job${active.length > 1 ? "s" : ""} remaining today`
            : "🎉 All jobs done for today!"}
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Stat blocks */}
        <div className="flex gap-3">
          {[
            { count: active.length, label: "Scheduled Today", icon: "📋", borderColor: "border-t-primary" },
            { count: completed.length, label: "Completed Today", icon: "✅", borderColor: "border-t-success" },
            { count: cancelled.length, label: "Cancelled", icon: "✕", borderColor: "border-t-destructive" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`flex-1 bg-card rounded-2xl border border-border ${stat.borderColor} border-t-4 p-4 text-center shadow-sm`}
            >
              <div className="text-xl mb-1.5">{stat.icon}</div>
              <div className="text-3xl font-black tracking-tighter leading-none mb-1">{stat.count}</div>
              <div className="text-[11px] font-semibold text-muted-foreground leading-snug">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* In progress banner */}
        {inProgress.length > 0 && (
          <div className="bg-warning/10 border border-warning rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning flex items-center justify-center text-xl shrink-0">⚙️</div>
            <div>
              <div className="text-[13px] font-extrabold text-warning">Job In Progress</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {customers[inProgress[0].customer_id]?.name} · {inProgress[0].time_block}
              </div>
            </div>
          </div>
        )}

        {/* Checklist badge */}
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex items-center gap-2.5">
          <span className="text-base">✅</span>
          <div className="text-xs text-primary font-semibold leading-relaxed">
            Each job: <strong>Call · Navigate · Start · Complete · Note · Photo · Cancel</strong>
          </div>
        </div>

        {/* Today's Jobs heading */}
        <div className="flex justify-between items-center">
          <div className="text-[17px] font-extrabold text-foreground">Today's Jobs</div>
          <span className="bg-primary/10 text-primary rounded-full px-3 py-0.5 text-xs font-bold">
            {active.length} left
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {active.length === 0 && completed.length > 0 && (
              <div className="text-center py-12 bg-card rounded-2xl border border-border">
                <div className="text-5xl mb-2.5">🎉</div>
                <div className="text-lg font-extrabold text-foreground mb-1">All done!</div>
                <div className="text-sm text-muted-foreground">
                  {completed.length} job{completed.length > 1 ? "s" : ""} completed today.
                </div>
              </div>
            )}

            {active.length === 0 && completed.length === 0 && cancelled.length === 0 && (
              <div className="text-center py-12 bg-card rounded-2xl border border-border">
                <div className="text-5xl mb-2.5">📋</div>
                <div className="text-lg font-extrabold text-foreground mb-1">No jobs today</div>
                <div className="text-sm text-muted-foreground">Check back tomorrow or contact the office.</div>
              </div>
            )}

            {active.map((job) => (
              <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
            ))}

            {completed.length > 0 && (
              <>
                <div className="flex items-center gap-2.5 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] font-bold text-muted-foreground">COMPLETED</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {completed.map((job) => (
                  <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
                ))}
              </>
            )}

            {cancelled.length > 0 && (
              <>
                <div className="flex items-center gap-2.5 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] font-bold text-muted-foreground">CANCELLED</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {cancelled.map((job) => (
                  <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EngineerApp;
