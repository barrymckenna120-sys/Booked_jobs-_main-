import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import { format, addDays } from "date-fns";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";

const TIME_ORDER: Record<string, number> = { "9–11": 1, "11–2": 2, "2–5": 3 };

const TIME_RANGES: Record<string, [number, number]> = {
  "9–11": [9, 11],
  "11–2": [11, 14],
  "2–5":  [14, 17],
};

const getNextJobId = (jobs: any[]): string | null => {
  if (jobs.length === 0) return null;
  const now = new Date();
  const hour = now.getHours();

  // Find the current or next time block
  const blockOrder = ["9–11", "11–2", "2–5"];
  
  for (const block of blockOrder) {
    const [start, end] = TIME_RANGES[block];
    // Current block or future block
    if (hour < end) {
      const match = jobs.find(j => j.time_block === block && j.status !== "Completed" && j.status !== "Cancelled");
      if (match) return match.id;
    }
  }

  // Fallback: first non-completed job
  const fallback = jobs.find(j => j.status !== "Completed" && j.status !== "Cancelled");
  return fallback?.id || null;
};

type Tab = "today" | "upcoming" | "completed";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const formatDateHeading = (d: Date) => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const todayISO = () => new Date().toISOString().split("T")[0];
const tomorrowISO = () => addDays(new Date(), 1).toISOString().split("T")[0];

const EngineerApp = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("today");
  const [todayJobs, setTodayJobs] = useState<any[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchCustomers = useCallback(async (jobs: any[]) => {
    const ids = [...new Set(jobs.map((j) => j.customer_id))];
    if (ids.length === 0) return;
    const { data } = await supabase.from("customers").select("*").in("id", ids);
    if (data) {
      setCustomers((prev) => {
        const map = { ...prev };
        data.forEach((c: any) => { map[c.id] = c; });
        return map;
      });
    }
  }, []);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [todayRes, upcomingRes, completedRes] = await Promise.all([
      supabase.from("service_calls").select("*").eq("scheduled_date", todayISO()).order("created_at"),
      supabase.from("service_calls").select("*").gt("scheduled_date", todayISO()).in("status", ["Scheduled", "Booked"]).order("scheduled_date").limit(20),
      supabase.from("service_calls").select("*").eq("status", "Completed").order("updated_at", { ascending: false }).limit(30),
    ]);

    const allJobs = [...(todayRes.data || []), ...(upcomingRes.data || []), ...(completedRes.data || [])];
    setTodayJobs(todayRes.data || []);
    setUpcomingJobs(upcomingRes.data || []);
    setCompletedJobs(completedRes.data || []);
    await fetchCustomers(allJobs);
    setLoading(false);
  }, [user, fetchCustomers]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  const updateJob = async (jobId: string, patch: Record<string, any>, _options?: { jobTagDate?: string | null }) => {
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, cancelReason, cancelNote, paymentMethod, selectedTags, selectedJobType, confirmedRevenue, ...rest } = patch;

    let notesUpdate = rest.notes;
    if (workDone) {
      notesUpdate = `Work done: ${workDone}${parts ? `\nParts: ${parts}` : ""}${officeNote ? `\nOffice note: ${officeNote}` : ""}${followUp ? `\nFollow-up: ${followUpNote}` : ""}`;
    }
    if (cancelReason) {
      notesUpdate = `Cancelled: ${cancelReason}${cancelNote ? `\nNote: ${cancelNote}` : ""}`;
    }

    const dbPatch: Record<string, any> = sanitizeServiceCallUpdatePayload({ ...rest });
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;
    if (cancelReason) {
      dbPatch.cancellation_reason = cancelReason;
      dbPatch.cancellation_note = cancelNote || null;
      dbPatch.cancelled_at = new Date().toISOString();
      dbPatch.cancelled_by = user?.id || null;
    }

    const safeDbPatch = sanitizeServiceCallUpdatePayload(dbPatch);
    const { error } = await supabase.from("service_calls").update(safeDbPatch).eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Update local state across all lists
      const updater = (prev: any[]) => prev.map((j) => (j.id === jobId ? { ...j, ...dbPatch } : j));
      setTodayJobs(updater);
      setUpcomingJobs(updater);
      setCompletedJobs(updater);
      toast({ title: patch.status === "Completed" ? "Job completed ✔" : patch.status === "Cancelled" ? "Job cancelled" : "Updated" });
    }
  };

  const sortByTime = (arr: any[]) =>
    [...arr].sort((a, b) => (TIME_ORDER[a.time_block] || 99) - (TIME_ORDER[b.time_block] || 99));

  // Today tab data
  const todayActive = sortByTime(todayJobs.filter((j) => j.status !== "Completed" && j.status !== "Cancelled"));
  const todayCompleted = sortByTime(todayJobs.filter((j) => j.status === "Completed"));
  const todayCancelled = sortByTime(todayJobs.filter((j) => j.status === "Cancelled"));
  const todayInProgress = todayJobs.filter((j) => j.status === "In Progress");

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-secondary pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-5 pt-12 pb-7 relative overflow-hidden">
        <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-white/[0.07] pointer-events-none" />
        <div className="absolute -bottom-14 right-12 w-36 h-36 rounded-full bg-white/[0.05] pointer-events-none" />

        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg">🔥</div>
          <span className="text-white/80 text-sm font-semibold">Karl's Gas</span>
        </div>

        <div className="text-[13px] text-white/70 font-medium mb-1">{formatDateHeading(new Date())}</div>
        <div className="text-[28px] font-extrabold text-white tracking-tight leading-tight mb-1.5">
          {greeting()},<br />Karl 👋
        </div>
        <div className="text-[13px] text-white/75 font-medium">
          {todayActive.length > 0
            ? `${todayActive.length} job${todayActive.length > 1 ? "s" : ""} remaining today`
            : "🎉 All jobs done for today!"}
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {tab === "today" && <TodayView
          active={todayActive}
          completed={todayCompleted}
          cancelled={todayCancelled}
          inProgress={todayInProgress}
          customers={customers}
          loading={loading}
          onUpdate={updateJob}
          onViewTomorrow={() => setTab("upcoming")}
        />}
        {tab === "upcoming" && <UpcomingView jobs={upcomingJobs} customers={customers} loading={loading} onUpdate={updateJob} />}
        {tab === "completed" && <CompletedView jobs={completedJobs} customers={customers} loading={loading} onUpdate={updateJob} />}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-card border-t border-border flex z-50">
        {([
          { key: "today" as Tab, label: "Today", icon: Clock, count: todayActive.length },
          { key: "upcoming" as Tab, label: "Upcoming", icon: CalendarDays, count: upcomingJobs.length },
          { key: "completed" as Tab, label: "Completed", icon: CheckCircle2, count: todayCompleted.length },
        ]).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-colors ${
              tab === item.key ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <item.icon className="w-5 h-5" />
              {item.count > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {item.count}
                </span>
              )}
            </div>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ─── Today Tab ─── */
const TodayView = ({ active, completed, cancelled, inProgress, customers, loading, onUpdate, onViewTomorrow }: any) => {
  const nextJobId = getNextJobId(active);
  
  // Sort: next job first, then by time order
  const sortedActive = nextJobId
    ? [active.find((j: any) => j.id === nextJobId), ...active.filter((j: any) => j.id !== nextJobId)]
    : active;

  return (
    <>
    <div className="flex gap-3">
      {[
        { count: active.length, label: "Scheduled", icon: "📋", borderColor: "border-t-primary" },
        { count: completed.length, label: "Completed", icon: "✅", borderColor: "border-t-success" },
        { count: cancelled.length, label: "Cancelled", icon: "✕", borderColor: "border-t-destructive" },
      ].map((stat) => (
        <div key={stat.label} className={`flex-1 bg-card rounded-2xl border border-border ${stat.borderColor} border-t-4 p-4 text-center shadow-sm`}>
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

    {/* Heading */}
    <div className="flex justify-between items-center">
      <div className="text-[17px] font-extrabold text-foreground">Today's Jobs</div>
      <span className="bg-primary/10 text-primary rounded-full px-3 py-0.5 text-xs font-bold">{active.length} left</span>
    </div>

    {loading ? (
      <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
    ) : (
      <>
        {active.length === 0 && completed.length === 0 && cancelled.length === 0 && (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <div className="text-5xl mb-2.5">📋</div>
            <div className="text-lg font-extrabold text-foreground mb-1">No jobs scheduled today</div>
            <div className="text-sm text-muted-foreground mb-4">Check back tomorrow or contact the office.</div>
            <button onClick={onViewTomorrow} className="text-sm font-bold text-primary underline underline-offset-2">
              View Upcoming →
            </button>
          </div>
        )}

        {active.length === 0 && completed.length > 0 && (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <div className="text-5xl mb-2.5">🎉</div>
            <div className="text-lg font-extrabold text-foreground mb-1">All done!</div>
            <div className="text-sm text-muted-foreground">{completed.length} job{completed.length > 1 ? "s" : ""} completed today.</div>
          </div>
        )}

        {sortedActive.map((job: any) => (
          <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={onUpdate} isNextJob={job.id === nextJobId} />
        ))}

        {completed.length > 0 && (
          <>
            <SectionDivider label="COMPLETED" />
            {completed.map((job: any) => (
              <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={onUpdate} />
            ))}
          </>
        )}

        {cancelled.length > 0 && (
          <>
            <SectionDivider label="CANCELLED" />
            {cancelled.map((job: any) => (
              <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={onUpdate} />
            ))}
          </>
        )}
      </>
    )}
    </>
  );
};

/* ─── Upcoming Tab ─── */
const UpcomingView = ({ jobs, customers, loading, onUpdate }: any) => {
  // Group by date
  const grouped: Record<string, any[]> = {};
  jobs.forEach((j: any) => {
    const d = j.scheduled_date || "Unscheduled";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(j);
  });

  return (
    <>
      <div className="text-[17px] font-extrabold text-foreground">Upcoming Jobs</div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <div className="text-5xl mb-2.5">📅</div>
          <div className="text-lg font-extrabold text-foreground mb-1">No upcoming jobs</div>
          <div className="text-sm text-muted-foreground">Your schedule is clear.</div>
        </div>
      ) : (
        Object.entries(grouped).map(([date, dateJobs]) => (
          <div key={date}>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-2">
              📅 {date !== "Unscheduled" ? format(new Date(date + "T00:00:00"), "EEEE d MMM") : "Unscheduled"}
            </div>
            {dateJobs.map((job: any) => (
              <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={onUpdate} />
            ))}
          </div>
        ))
      )}
    </>
  );
};

/* ─── Completed Tab ─── */
const CompletedView = ({ jobs, customers, loading, onUpdate }: any) => (
  <>
    <div className="text-[17px] font-extrabold text-foreground">Completed Jobs</div>
    {loading ? (
      <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
    ) : jobs.length === 0 ? (
      <div className="text-center py-12 bg-card rounded-2xl border border-border">
        <div className="text-5xl mb-2.5">✅</div>
        <div className="text-lg font-extrabold text-foreground mb-1">No completed jobs yet</div>
      </div>
    ) : (
      jobs.map((job: any) => (
        <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={onUpdate} />
      ))
    )}
  </>
);

const SectionDivider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2.5 my-2">
    <div className="flex-1 h-px bg-border" />
    <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
    <div className="flex-1 h-px bg-border" />
  </div>
);

export default EngineerApp;
