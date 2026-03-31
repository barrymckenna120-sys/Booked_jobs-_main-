import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OutstandingJob = {
  id: string;
  job_type: string;
  revenue: number;
  deposit_amount: number;
  customer_name: string;
  payment_link: string | null;
};

const eur = (n: number) => `€${n.toFixed(2)}`;
const jobRef = (id: string) => "BJ-" + id.substring(0, 6).toUpperCase();

const EngineerOutstandingBalances = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<OutstandingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const { data: eng } = await supabase
        .from("engineers")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!eng) { setLoading(false); return; }

      const { data: rows } = await supabase
        .from("service_calls")
        .select("id, job_type, revenue, deposit_amount, deposit_paid, payment_status, customer_id, customers(name)")
        .eq("assigned_engineer_id", eng.id)
        .eq("deposit_paid", true)
        .neq("payment_status", "paid")
        .not("status", "eq", "Cancelled")
        .order("scheduled_date", { ascending: false });

      if (rows) {
        setJobs(
          rows
            .filter((r: any) => {
              const rev = r.revenue || 0;
              const dep = r.deposit_amount || 0;
              return rev > dep && dep > 0;
            })
            .map((r: any) => ({
              id: r.id,
              job_type: r.job_type,
              revenue: r.revenue || 0,
              deposit_amount: r.deposit_amount || 0,
              customer_name: r.customers?.name || "Unknown",
            }))
        );
      }
      setLoading(false);
    })();
  }, [user]);

  const handleSendLink = async (job: OutstandingJob) => {
    setSendingId(job.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-payment-link", {
        body: { service_call_id: job.id },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Failed to send payment link");
      }

      toast({ title: "✅ Payment link sent", description: `Sent to ${data.customer_name} via WhatsApp` });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setTimeout(() => setSendingId(null), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-extrabold text-foreground">⚠️ Outstanding Balances</h2>
        <Badge
          className="rounded-full text-xs font-bold px-2.5 py-0.5"
          style={{ background: "#F59E0B", color: "#fff", border: "none" }}
        >
          {jobs.length}
        </Badge>
      </div>

      {jobs.map((job) => {
        const balance = job.revenue - job.deposit_amount;
        const isSending = sendingId === job.id;
        return (
          <div
            key={job.id}
            className="bg-card rounded-2xl p-4 border-2"
            style={{ borderColor: "#FDE68A" }}
          >
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="text-sm font-bold text-foreground">{job.customer_name}</div>
                <div className="text-xs text-muted-foreground">
                  {job.job_type} · {jobRef(job.id)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold font-mono" style={{ color: "#F59E0B" }}>
                  {eur(balance)}
                </div>
                <div className="text-[11px] text-muted-foreground">Balance Due</div>
              </div>
            </div>

            <div className="h-px bg-border my-3" />

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5 text-xs font-bold text-white"
                style={{ background: "#4A86E8" }}
                onClick={() => window.location.href = `/engineer/job/${job.id}`}
              >
                💳 Take Payment
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 text-xs font-bold"
                disabled={isSending}
                onClick={() => handleSendLink(job)}
              >
                {isSending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                ) : (
                  <>📲 Send Link</>
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EngineerOutstandingBalances;
