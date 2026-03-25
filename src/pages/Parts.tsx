import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Package, CalendarClock } from "lucide-react";
import PartsArrivedModal from "@/components/jobs/PartsArrivedModal";

const priorityOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };

const priorityConfig: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  urgent: { emoji: "🔴", label: "Urgent", bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
  normal: { emoji: "🟡", label: "Normal", bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  low:    { emoji: "🟢", label: "Low",    bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
};

const Parts = () => {
  const navigate = useNavigate();
  const [arrivedJob, setArrivedJob] = useState<any>(null);

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: ["parts-page-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, status, notes, parts_priority, parts_logged_at, assigned_engineer, scheduled_date, follow_up_detail, customers(name, address, phone)")
        .in("status", ["parts_needed", "parts_ordered"])
        .order("parts_logged_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30000,
  });

  const needed = jobs
    .filter((j: any) => j.status === "parts_needed")
    .sort((a: any, b: any) => (priorityOrder[a.parts_priority] ?? 99) - (priorityOrder[b.parts_priority] ?? 99));

  const ordered = jobs.filter((j: any) => j.status === "parts_ordered");

  const extractPartText = (notes: string | null) => {
    if (!notes) return "—";
    return notes.replace(/^Parts Needed(?:\s*\[\w+\])?:\s*/, "");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="w-6 h-6 text-amber-500" />
        <h1 className="text-2xl font-extrabold text-foreground">Parts</h1>
        <span className="text-sm text-muted-foreground ml-1">
          {jobs.length} total
        </span>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {/* Parts Needed Section */}
      {needed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base font-bold text-foreground">🔴 Parts Needed</span>
            <span className="text-xs text-muted-foreground">({needed.length})</span>
          </div>
          <div className="space-y-2">
            {needed.map((job: any) => {
              const pCfg = job.parts_priority ? priorityConfig[job.parts_priority] : null;
              return (
                <Card
                  key={job.id}
                  className="border-l-4 cursor-pointer hover:shadow-md transition-shadow"
                  style={{ borderLeftColor: pCfg?.text === "text-[#DC2626]" ? "#DC2626" : pCfg?.text === "text-[#16A34A]" ? "#16A34A" : "#F59E0B" }}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground truncate">{job.customers?.name || "Unknown"}</p>
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">{extractPartText(job.notes)}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>🔧 {job.assigned_engineer || "Unassigned"}</span>
                          <span>📅 {fmtDate(job.parts_logged_at)}</span>
                        </div>
                      </div>
                      {pCfg && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${pCfg.bg} ${pCfg.text}`}>
                          {pCfg.emoji} {pCfg.label}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Parts Ordered Section */}
      {ordered.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base font-bold text-foreground">📦 Parts Ordered</span>
            <span className="text-xs text-muted-foreground">({ordered.length})</span>
          </div>
          <div className="space-y-2 opacity-70">
            {ordered.map((job: any) => (
              <Card
                key={job.id}
                className="border-l-4 border-l-blue-400 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground truncate">{job.customers?.name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{extractPartText(job.notes)}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>🔧 {job.assigned_engineer || "Unassigned"}</span>
                        <span>📅 {fmtDate(job.parts_logged_at)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-600">
                        <Package className="w-3 h-3" /> Ordered
                      </span>
                      <Button
                        size="sm"
                        className="text-white font-bold gap-1 text-[11px] h-7 px-2.5"
                        style={{ backgroundColor: "#22C55E" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setArrivedJob(job);
                        }}
                      >
                        <CalendarClock className="w-3 h-3" /> Parts Arrived
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No parts needed right now</p>
          <p className="text-sm mt-1">When engineers flag parts, they'll appear here.</p>
        </div>
      )}

      {/* Parts Arrived Modal */}
      {arrivedJob && (
        <PartsArrivedModal
          open={!!arrivedJob}
          onClose={() => setArrivedJob(null)}
          jobId={arrivedJob.id}
          customerName={arrivedJob.customers?.name || "Customer"}
          customerPhone={arrivedJob.customers?.phone || ""}
          followUpDetail={arrivedJob.follow_up_detail}
          onSent={() => {
            setArrivedJob(null);
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default Parts;
