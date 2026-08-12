import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isOutstandingBalanceJob } from "@/lib/outstandingBalances";
import { Loader2, ChevronDown, ChevronUp, CreditCard, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TakePaymentModal from "@/components/payments/TakePaymentModal";

type OutstandingJob = {
  id: string;
  job_reference: string | null;
  scheduled_date: string | null;
  job_type: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  user_id: string;
  assigned_engineer: string | null;
  receipt_number: string | null;
  revenue: number | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  balance_due: number;
  payment_status: string | null;
};

const eur = (n: number) => `€${n.toFixed(2)}`;

const formatDate = (d: string | null) =>
  d
    ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-IE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const EngineerOutstandingBalances = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<OutstandingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [payJob, setPayJob] = useState<OutstandingJob | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: eng } = await supabase
        .from("engineers")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!eng) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Scoped server-side to this engineer's own jobs — nothing another
      // engineer owns is ever returned. Same prefilter as the office ledger.
      const { data: rows, error } = await supabase
        .from("service_calls")
        .select(
          "id, job_reference, scheduled_date, job_type, revenue, deposit_amount, deposit_paid, deposit_required, payment_method, payment_status, invoiced_at, balance_due, receipt_number, assigned_engineer, customer_id, user_id, status, customers(name, phone)"
        )
        .eq("assigned_engineer_id", (eng as any).id)
        .neq("payment_status", "paid")
        .not("status", "eq", "Cancelled")
        .or("invoiced_at.not.is.null,payment_method.eq.invoice,deposit_paid.eq.true")
        .order("scheduled_date", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("EngineerOutstandingBalances query failed:", error);
        setLoading(false);
        return;
      }

      setJobs(
        ((rows as any[]) || [])
          .filter((r: any) => isOutstandingBalanceJob(r))
          .map((r: any) => ({
            id: r.id,
            job_reference: r.job_reference || null,
            scheduled_date: r.scheduled_date,
            job_type: r.job_type,
            customer_id: r.customer_id,
            customer_name: r.customers?.name || "Unknown",
            customer_phone: r.customers?.phone || null,
            user_id: r.user_id,
            assigned_engineer: r.assigned_engineer,
            receipt_number: r.receipt_number || null,
            revenue: r.revenue,
            deposit_required: r.deposit_required,
            deposit_amount: r.deposit_amount,
            deposit_paid: r.deposit_paid,
            balance_due: Number(r.balance_due) || 0,
            payment_status: r.payment_status,
          }))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
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
      toast({ title: "✅ Payment link sent", description: `Sent to ${data.customer_name || job.customer_name} via WhatsApp` });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  if (loading) return null;
  if (jobs.length === 0) return null;

  const totalBalance = jobs.reduce((sum, j) => sum + j.balance_due, 0);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm font-bold" style={{ color: "#92400E" }}>
          ⚠️ {jobs.length} outstanding balance{jobs.length !== 1 ? "s" : ""} · {eur(totalBalance)}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 ml-auto shrink-0" style={{ color: "#92400E" }} />
        ) : (
          <ChevronDown className="w-4 h-4 ml-auto shrink-0" style={{ color: "#92400E" }} />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="bg-card rounded-xl border border-border/60 p-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/engineer/job/${job.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/engineer/job/${job.id}`)}
                className="cursor-pointer active:opacity-70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{job.customer_name}</div>
                    <div className="text-[11px] font-semibold text-muted-foreground truncate">
                      {job.job_reference || "—"} · {job.job_type} · {formatDate(job.scheduled_date)}
                    </div>
                  </div>
                  <div className="text-base font-black shrink-0" style={{ color: "#92400E" }}>
                    {eur(job.balance_due)}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-2.5">
                <Button
                  size="sm"
                  className="flex-1 h-9 text-xs font-bold gap-1.5"
                  onClick={() => setPayJob(job)}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Take Payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 text-xs font-bold gap-1.5"
                  disabled={sendingId === job.id}
                  onClick={() => handleSendLink(job)}
                >
                  {sendingId === job.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Send Link
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {payJob && (
        <TakePaymentModal
          open={!!payJob}
          onClose={() => setPayJob(null)}
          job={{
            id: payJob.id,
            customer_id: payJob.customer_id,
            job_type: payJob.job_type,
            scheduled_date: payJob.scheduled_date,
            assigned_engineer: payJob.assigned_engineer,
            user_id: payJob.user_id,
            receipt_number: payJob.receipt_number,
            revenue: payJob.revenue,
            deposit_required: payJob.deposit_required ?? false,
            deposit_amount: payJob.deposit_amount,
            deposit_paid: payJob.deposit_paid ?? false,
            balance_due: payJob.balance_due,
          }}
          customer={{
            id: payJob.customer_id,
            name: payJob.customer_name,
            phone: payJob.customer_phone,
          }}
          onPaymentComplete={() => {
            setPayJob(null);
            setJobs((prev) => prev.filter((j) => j.id !== payJob.id));
          }}
        />
      )}
    </div>
  );
};

export default EngineerOutstandingBalances;
