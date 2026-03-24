import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";

const FollowUpsPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { data: followUps = [], isLoading } = useQuery({
    queryKey: ["follow-ups", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, customer_id, follow_up_detail, completed_at, scheduled_date, assigned_engineer, customers(name, phone, address)")
        .eq("follow_up_needed", true)
        .eq("follow_up_resolved", false)
        .order("completed_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const handleSendPartArrived = async (job: any) => {
    const customer = (job as any).customers;
    if (!customer) return;
    setSendingId(job.id);
    try {
      const { error } = await supabase.functions.invoke("send-part-arrived", {
        body: {
          job_id: job.id,
          customer_name: customer.name,
          customer_phone: customer.phone,
          follow_up_detail: job.follow_up_detail || "",
        },
      });
      if (error) throw error;
      toast({ title: `Part arrived message sent to ${customer.name}` });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleMarkResolved = async (jobId: string) => {
    setResolvingId(jobId);
    const { error } = await supabase
      .from("service_calls")
      .update({
        follow_up_resolved: true,
        follow_up_resolved_at: new Date().toISOString(),
      } as any)
      .eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Follow-up marked as resolved" });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    }
    setResolvingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (followUps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No outstanding follow-ups 🎉
      </div>
    );
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-bold">{followUps.length} Follow-up{followUps.length !== 1 ? "s" : ""}</h2>
      </div>
      {followUps.map((job: any) => {
        const customer = job.customers;
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
                  <p className="text-sm text-muted-foreground">{customer?.address || "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Completed {fmtDate(job.completed_at || job.scheduled_date)}
                </span>
              </div>

              <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm font-medium text-amber-800">
                  ⚠️ {job.follow_up_detail || "Follow-up required"}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  disabled={sendingId === job.id}
                  onClick={() => handleSendPartArrived(job)}
                >
                  {sendingId === job.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="w-3.5 h-3.5" />
                  )}
                  Send Part Arrived Message
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 gap-1.5 font-bold"
                  disabled={resolvingId === job.id}
                  onClick={() => handleMarkResolved(job.id)}
                >
                  {resolvingId === job.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Mark Resolved
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default FollowUpsPanel;
