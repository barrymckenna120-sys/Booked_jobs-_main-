import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import IncomingJobCard from "@/components/incoming/IncomingJobCard";
import JobReviewPanel from "@/components/incoming/JobReviewPanel";

type IncomingJob = {
  id: string;
  customer_id: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  assigned_engineer: string | null;
  notes: string | null;
  boiler_brand: string | null;
  boiler_working: boolean | null;
  boiler_issue: string | null;
  source: string | null;
  incoming_status: string | null;
  created_at: string;
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    eircode: string;
    area_code: string | null;
    boiler_make_model: string | null;
  };
};

const FILTERS = ["All", "Pending", "Assigned", "Rejected"] as const;

const filterStyles: Record<string, { active: string; inactive: string }> = {
  All:      { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
  Pending:  { active: "border-warning bg-warning/10 text-warning", inactive: "border-border text-muted-foreground" },
  Assigned: { active: "border-success bg-success/10 text-success", inactive: "border-border text-muted-foreground" },
  Rejected: { active: "border-destructive bg-destructive/10 text-destructive", inactive: "border-border text-muted-foreground" },
};

const IncomingJobs = () => {
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<IncomingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [mediaCounts, setMediaCounts] = useState<Record<string, number>>({});
  const [reviewJob, setReviewJob] = useState<IncomingJob | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("service_calls")
      .select("*, customers!inner(id, name, phone, email, address, eircode, area_code, boiler_make_model)")
      .eq("user_id", user.id)
      .eq("source", "Tally Form")
      .order("created_at", { ascending: false });

    if (filter !== "All") {
      query = query.eq("incoming_status", filter);
    }

    const { data } = await query;
    const jobsData = (data || []) as unknown as IncomingJob[];
    setJobs(jobsData);

    if (jobsData.length > 0) {
      const jobIds = jobsData.map((j) => j.id);
      const { data: mediaData } = await supabase
        .from("job_media")
        .select("job_id")
        .in("job_id", jobIds);
      const counts: Record<string, number> = {};
      (mediaData || []).forEach((m: any) => {
        counts[m.job_id] = (counts[m.job_id] || 0) + 1;
      });
      setMediaCounts(counts);
    }
    setLoading(false);
  }, [user, filter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const pendingCount = jobs.filter((j) => j.incoming_status === "Pending").length;
  const assignedCount = jobs.filter((j) => j.incoming_status === "Assigned").length;
  const withPhotoCount = jobs.filter((j) => mediaCounts[j.id] > 0).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold">📥 Incoming Jobs</h1>
          {pendingCount > 0 && (
            <span className="bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-extrabold">
              {pendingCount}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">From online booking form</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const active = filter === f;
          const styles = filterStyles[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border-[1.5px] transition-colors ${
                active ? styles.active + " font-bold" : styles.inactive + " bg-card hover:bg-muted"
              }`}
            >
              {f}{f === "Pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          );
        })}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { icon: "📥", value: pendingCount, label: "Pending", color: "border-t-warning", alert: true },
          { icon: "👁", value: jobs.filter((j) => j.incoming_status === "Reviewed").length, label: "Reviewed", color: "border-t-primary" },
          { icon: "✅", value: assignedCount, label: "Assigned", color: "border-t-success" },
          { icon: "📷", value: withPhotoCount, label: "With Photo", color: "border-t-[hsl(263,70%,46%)]" },
        ].map((k) => (
          <Card key={k.label} className={`border-t-[3px] ${k.color}`}>
            <CardContent className="p-3 text-center">
              <div className="text-lg mb-0.5">{k.icon}</div>
              <div className={`text-xl font-extrabold leading-none ${k.alert ? "text-destructive" : ""}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground font-medium mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading...</p>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-3xl mb-2">📥</div>
          <div className="font-bold">No {filter !== "All" ? filter : ""} incoming jobs</div>
        </div>
      ) : (
        jobs.map((j) => (
          <IncomingJobCard
            key={j.id}
            job={j}
            mediaCount={mediaCounts[j.id] || 0}
            onClick={() => setReviewJob(j)}
          />
        ))
      )}

      {/* Review Panel */}
      <JobReviewPanel
        job={reviewJob}
        customer={reviewJob?.customers || null}
        open={!!reviewJob}
        onClose={() => setReviewJob(null)}
        onUpdated={fetchJobs}
      />
    </div>
  );
};

export default IncomingJobs;
