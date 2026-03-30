import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, CheckCircle2, MessageCircle, Loader2, Wrench } from "lucide-react";

const PartsPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: partsJobs = [], isLoading } = useQuery({
    queryKey: ["parts-panel", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, customer_id, status, parts_notes, parts_status, completed_at, scheduled_date, assigned_engineer, parts_priority, parts_logged_at, customers(name, phone, address)")
        .not("parts_status", "is", null)
        .neq("parts_status" as any, "Fitted")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const handleSendMessage = async (job: any) => {
    const customer = (job as any).customers;
    if (!customer) return;
    setSendingId(job.id);
    try {
      const { error } = await supabase.functions.invoke("send-part-arrived", {
        body: {
          job_id: job.id,
          customer_name: customer.name,
          customer_phone: customer.phone,
          follow_up_detail: job.parts_notes || job.follow_up_detail || "",
        },
      });
      if (error) throw error;
      toast({ title: `Message sent to ${customer.name}` });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleUpdateStatus = async (jobId: string, newStatus: string) => {
    setUpdatingId(jobId);
    const { error } = await supabase
      .from("service_calls")
      .update({ parts_status: newStatus } as any)
      .eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Parts marked as ${newStatus}` });
      queryClient.invalidateQueries({ queryKey: ["parts-panel"] });
      queryClient.invalidateQueries({ queryKey: ["parts-count"] });
    }
    setUpdatingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (partsJobs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No outstanding parts 🎉
      </div>
    );
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    Ordered:  { bg: "bg-blue-100", text: "text-blue-700", label: "Ordered" },
    Received: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Received" },
    Fitted:   { bg: "bg-gray-100", text: "text-gray-500", label: "Fitted" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-bold">{partsJobs.length} Part{partsJobs.length !== 1 ? "s" : ""}</h2>
      </div>
      {partsJobs.map((job: any) => {
        const customer = job.customers;
        const sCfg = statusConfig[job.parts_status] || statusConfig.Ordered;
        return (
          <Card key={job.id} className="border-amber-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <button
                    className="font-bold text-foreground hover:text-primary transition-colors text-left"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    {customer?.name || "Unknown"}
                  </button>
                  <p className="text-sm text-muted-foreground">{customer?.phone || "—"}</p>
                  <button
                    className="text-sm text-muted-foreground text-left hover:text-primary transition-colors"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    {customer?.address || "—"}
                  </button>
                  <button
                    className="text-xs font-medium text-left hover:underline block"
                    style={{ color: "#4A86E8" }}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    View Job →
                  </button>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sCfg.bg} ${sCfg.text}`}>
                    {sCfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(job.completed_at || job.scheduled_date)}
                  </span>
                </div>
              </div>

              {job.parts_notes && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                  <p className="text-sm font-medium text-amber-800">
                    ⚠️ {job.parts_notes}
                  </p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  disabled={sendingId === job.id}
                  onClick={() => handleSendMessage(job)}
                >
                  {sendingId === job.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="w-3.5 h-3.5" />
                  )}
                  Send Message
                </Button>

                {job.parts_status === "Ordered" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9 gap-1.5 font-bold"
                    disabled={updatingId === job.id}
                    onClick={() => handleUpdateStatus(job.id, "Received")}
                  >
                    {updatingId === job.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Mark Received
                  </Button>
                )}

                {job.parts_status === "Received" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9 gap-1.5 font-bold"
                    disabled={updatingId === job.id}
                    onClick={() => handleUpdateStatus(job.id, "Fitted")}
                  >
                    {updatingId === job.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5" />
                    )}
                    Mark Fitted
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PartsPanel;
