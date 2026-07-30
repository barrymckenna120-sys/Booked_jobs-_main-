import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox, Eye, CheckCircle2, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import IncomingJobCard from "@/components/incoming/IncomingJobCard";
import JobReviewPanel from "@/components/incoming/JobReviewPanel";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";

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
  email: string | null;
  job_issue: string | null;
  extra_details: string | null;
  boiler_type: string | null;
  boiler_error_code: string | null;
  area_code: string | null;
  owner_or_tenant: string | null;
  access_notes: string | null;
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    eircode: string;
    area_code: string | null;
    access_notes: string | null;
    boiler_make_model: string | null;
  };
};

const FILTERS = ["All", "Pending", "Assigned", "Rejected", "Archived"] as const;

const filterStyles: Record<string, { active: string; inactive: string }> = {
  All:      { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
  Pending:  { active: "border-warning bg-warning/10 text-warning", inactive: "border-border text-muted-foreground" },
  Assigned: { active: "border-success bg-success/10 text-success", inactive: "border-border text-muted-foreground" },
  Rejected: { active: "border-destructive bg-destructive/10 text-destructive", inactive: "border-border text-muted-foreground" },
  Archived: { active: "border-2 border-primary bg-primary text-primary-foreground font-bold", inactive: "border-2 border-primary/40 text-primary font-bold" },
};

const IncomingJobs = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<IncomingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [mediaCounts, setMediaCounts] = useState<Record<string, number>>({});
  const [reviewJob, setReviewJob] = useState<IncomingJob | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organisation_id")
        .eq("user_id", user.id)
        .maybeSingle();
      setOrgId(data?.organisation_id ?? null);
    })();
  }, [user]);
  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("service_calls")
      .select("*, customers(id, name, phone, email, address, eircode, area_code, gprn, access_notes, boiler_make_model)")
      .eq("source", "Tally Form")
      .order("created_at", { ascending: false });

    if (filter === "Archived") {
      query = query.eq("incoming_status", "Archived");
    } else if (filter !== "All") {
      query = query.eq("incoming_status", filter);
    } else {
      // "All" excludes archived jobs
      query = query.neq("incoming_status", "Archived");
    }

    const { data, error } = await query;
    console.log('[IncomingJobs] data:', data, 'error:', error);
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

  // Realtime subscription for new/updated incoming jobs
  useEffect(() => {
    if (!user || !orgId) return;
    const channel = supabase
      .channel('incoming-jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_calls',
          filter: `organisation_id=eq.${orgId}`,
        },
        () => { fetchJobs(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, orgId, fetchJobs]);

  const handleArchive = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    const isArchived = job?.incoming_status === "Archived";
    // Restore to previous status — default to "Pending" if unknown
    const newStatus = isArchived ? "Pending" : "Archived";

    // Optimistic update
    setJobs((prev) => prev.filter((j) => j.id !== jobId));

    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({ incoming_status: newStatus }))
      .eq("id", jobId);

    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
      fetchJobs();
    } else {
      toast({ title: isArchived ? "Job restored" : "Job archived" });
      fetchJobs();
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const pendingCount = jobs.filter((j) => j.incoming_status === "Pending").length;
  const assignedCount = jobs.filter((j) => j.incoming_status === "Assigned").length;
  const withPhotoCount = jobs.filter((j) => mediaCounts[j.id] > 0).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            Incoming Jobs
          </h1>
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
          { icon: <Inbox className="w-5 h-5 text-warning" />, value: pendingCount, label: "Pending", color: "border-t-warning", alert: true },
          { icon: <Eye className="w-5 h-5 text-primary" />, value: jobs.filter((j) => j.incoming_status === "Reviewed").length, label: "Reviewed", color: "border-t-primary" },
          { icon: <CheckCircle2 className="w-5 h-5 text-success" />, value: assignedCount, label: "Assigned", color: "border-t-success" },
          { icon: <Camera className="w-5 h-5 text-accent-foreground" />, value: withPhotoCount, label: "With Photo", color: "border-t-accent-foreground" },
        ].map((k) => (
          <Card key={k.label} className={`border-t-[3px] ${k.color}`}>
            <CardContent className="p-3 text-center">
              <div className="flex justify-center mb-1">{k.icon}</div>
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
        <div className="text-center py-12 px-4 max-w-md mx-auto">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="font-bold text-base mb-2">
            No {filter !== "All" ? filter.toLowerCase() : ""} incoming jobs
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            New bookings from your online form will appear here automatically. If you're expecting jobs but don't see any, your account may not have access yet.
          </p>
          <div className="bg-muted/50 border border-border rounded-lg p-3 text-left text-xs text-muted-foreground">
            <div className="font-semibold text-foreground mb-1.5">Not seeing jobs your teammates can see?</div>
            <ul className="space-y-1 list-disc list-inside">
              <li>Ask an admin to confirm you're added to the team in <span className="font-medium">Settings → Team Management</span>.</li>
              <li>Make sure your role (admin / office) has permission to view incoming jobs.</li>
              <li>Database access rules (RLS) scope jobs to your organisation — a teammate may need to grant access.</li>
            </ul>
          </div>
        </div>
      ) : (
        jobs.map((j) =>
          j.customers ? (
            <IncomingJobCard
              key={j.id}
              job={j}
              mediaCount={mediaCounts[j.id] || 0}
              onClick={() => setReviewJob(j)}
              onArchive={handleArchive}
            />
          ) : (
            <div
              key={j.id}
              className="bg-card border border-border border-l-4 border-l-muted-foreground rounded-xl p-4 mb-3 opacity-70"
            >
              <div className="text-[15px] font-extrabold">Unknown customer</div>
              <div className="text-xs text-muted-foreground mt-1">
                Job ID: {j.id} · Customer record missing or hidden
              </div>
            </div>
          )
        )
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
