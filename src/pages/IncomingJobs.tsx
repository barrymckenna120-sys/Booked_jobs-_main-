import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
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

const statusBadge = (status: string | null) => {
  const styles: Record<string, string> = {
    Pending: "bg-warning/10 text-warning",
    Reviewed: "bg-primary/10 text-primary",
    Assigned: "bg-success/10 text-success",
    Rejected: "bg-destructive/10 text-destructive",
  };
  const s = status || "Pending";
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${styles[s] || "bg-muted text-muted-foreground"}`}>
      {s}
    </span>
  );
};

const IncomingJobs = () => {
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<IncomingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("Pending");
  const [mediaCounts, setMediaCounts] = useState<Record<string, number>>({});
  const [reviewJob, setReviewJob] = useState<IncomingJob | null>(null);

  const fetchJobs = async () => {
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

    // Fetch media counts
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
  };

  useEffect(() => {
    fetchJobs();
  }, [user, filter]);

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">📥 Incoming Jobs</h1>
        <p className="text-sm text-muted-foreground">Submitted via online booking form</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f === "Pending" ? "Pending Review" : f}
          </button>
        ))}
      </div>

      {/* Jobs table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Loading...</p>
          ) : jobs.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No incoming jobs {filter !== "All" ? `with status "${filter}"` : ""}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary">
                    <TableHead className="text-xs uppercase font-semibold">Submitted</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Customer</TableHead>
                    <TableHead className="text-xs uppercase font-semibold hidden md:table-cell">Area</TableHead>
                    <TableHead className="text-xs uppercase font-semibold hidden md:table-cell">Boiler</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Working?</TableHead>
                    <TableHead className="text-xs uppercase font-semibold hidden md:table-cell">Time Pref</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Media</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Status</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="text-xs text-muted-foreground">{relativeTime(j.created_at)}</TableCell>
                      <TableCell className="font-semibold text-sm">{j.customers.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{j.customers.area_code || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{j.boiler_brand || "—"}</TableCell>
                      <TableCell>
                        {j.boiler_working === false
                          ? <span className="text-destructive font-bold text-sm">✗ No</span>
                          : <span className="text-success font-bold text-sm">✓ Yes</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{j.time_block || "—"}</TableCell>
                      <TableCell>
                        {mediaCounts[j.id] ? (
                          <span className="flex items-center gap-1 text-xs text-primary font-semibold">
                            <Camera className="w-3.5 h-3.5" /> {mediaCounts[j.id]}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(j.incoming_status)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => setReviewJob(j)}>Review</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
