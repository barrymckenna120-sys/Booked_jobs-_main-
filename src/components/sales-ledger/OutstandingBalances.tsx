import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isOutstandingBalanceJob, outstandingBalanceAmount } from "@/lib/outstandingBalances";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { CreditCard, ExternalLink, Loader2, Bell } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import ReminderChecklistModal from "./ReminderChecklistModal";

type OutstandingJob = {
  id: string;
  job_reference: string | null;
  scheduled_date: string | null;
  job_type: string;
  assigned_engineer: string | null;
  revenue: number | null;
  deposit_amount: number | null;
  customer_name: string;
  receipt_number: string | null;
  payment_status: string | null;
  reminder_14day_sent: boolean;
  customer_phone: string | null;
  invoiced_at: string | null;
};

const eur = (n: number) => `€${n.toFixed(2)}`;

const OutstandingBalances = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<OutstandingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [reminderModalJob, setReminderModalJob] = useState<OutstandingJob | null>(null);
  const [sentReminders, setSentReminders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("service_calls")
      .select("id, job_reference, scheduled_date, job_type, assigned_engineer, revenue, deposit_amount, deposit_required, deposit_paid, payment_method, payment_status, receipt_number, reminder_14day_sent, customer_id, completed_at, invoiced_at, balance_due, customers(name, phone)")
      .eq("organisation_id", orgId)
      .neq("payment_status", "paid")
      .not("status", "eq", "Cancelled")
      // Include invoiced jobs, invoice-method jobs, and any job where money has
      // already been taken (e.g. a SumUp card deposit on a not-yet-invoiced job).
      .or("invoiced_at.not.is.null,payment_method.eq.invoice,deposit_paid.eq.true")
      .order("scheduled_date", { ascending: false })
      .then(({ data: rows, error }) => {
        if (error) {
          console.error("OutstandingBalances query failed:", error);
          setLoading(false);
          return;
        }
        if (rows) {
          setJobs(
            rows
              .filter((r: any) => isOutstandingBalanceJob(r))
              .map((r: any) => ({
                id: r.id,
                job_reference: r.job_reference || null,
                scheduled_date: r.scheduled_date,
                job_type: r.job_type,
                assigned_engineer: r.assigned_engineer,
                revenue: r.revenue,
                deposit_amount: r.deposit_amount,
                customer_name: r.customers?.name || "Unknown",
                receipt_number: r.receipt_number,
                payment_status: r.payment_status,
                reminder_14day_sent: !!r.reminder_14day_sent,
                customer_phone: r.customers?.phone || null,
                invoiced_at: r.invoiced_at || null,
              }))
          );
        }
        setLoading(false);
      });
  }, [user, orgId]);

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

  const handleSendReminder = async (jobId: string) => {
    const { data, error } = await supabase.functions.invoke("trigger-outstanding-reminder", {
      body: { service_call_id: jobId },
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || "Failed to send reminder");
    }

    // Mark locally as sent
    setSentReminders((prev) => new Set(prev).add(jobId));
    setReminderModalJob(null);
    toast({ title: "✅ Reminder sent", description: `14-day outstanding invoice reminder sent successfully.` });
  };

  if (loading) {
    return (
      <div className="rounded-xl border-2 p-6" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  const totals = jobs.reduce(
    (acc, j) => {
      const rev = j.revenue || 0;
      const dep = j.deposit_amount || 0;
      acc.total += rev;
      acc.deposit += dep;
      acc.balance += outstandingBalanceAmount(j);
      return acc;
    },
    { total: 0, deposit: 0, balance: 0 }
  );

  const jobRefStr = (job: any) => job?.job_reference || "KN-" + (job?.id || "").substring(0, 6).toUpperCase();

  const getOutstandingDays = (invoiced_at: string | null) => {
    if (!invoiced_at) return { days: 0, bg: "#DCFCE7", color: "#16A34A", border: "#BBF7D0" };
    const days = Math.floor((Date.now() - new Date(invoiced_at).getTime()) / 86400000);
    return {
      days,
      bg: days >= 15 ? "#FEE2E2" : days >= 7 ? "#FEF3C7" : "#DCFCE7",
      color: days >= 15 ? "#DC2626" : days >= 7 ? "#D97706" : "#16A34A",
      border: days >= 15 ? "#FCA5A5" : days >= 7 ? "#FDE68A" : "#BBF7D0",
    };
  };

  return (
    <>
      <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: "#FDE68A" }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold" style={{ color: "#92400E" }}>
              ⚠️ Outstanding Balances
            </h2>
            <Badge
              className="rounded-full text-xs font-bold px-2.5 py-0.5"
              style={{ background: "#F59E0B", color: "#fff", border: "none" }}
            >
              {jobs.length}
            </Badge>
          </div>
        </div>

        {/* Mobile Cards */}
        {isMobile ? (
          <div className="space-y-3 p-3">
            {jobs.map((job) => {
              const rev = job.revenue || 0;
              const dep = job.deposit_amount || 0;
              const bal = outstandingBalanceAmount(job);
              const isSending = sendingId === job.id;
              const reminderAlreadySent = job.reminder_14day_sent || sentReminders.has(job.id);
              const od = getOutstandingDays(job.invoiced_at);

              return (
                <div
                  key={job.id}
                  className="bg-card rounded-xl p-4 border"
                  style={{ borderLeft: `4px solid ${od.color}` }}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <a href={`/jobs/${job.id}`} className="font-mono font-bold text-sm text-primary hover:underline">
                        {jobRefStr(job)}
                      </a>
                      <span className="text-xs text-muted-foreground ml-2">
                        {job.scheduled_date ? format(new Date(job.scheduled_date + "T00:00:00"), "dd/MM/yy") : "—"}
                      </span>
                    </div>
                    <Badge className="rounded-full text-xs font-bold px-2 py-0.5" style={{ background: od.bg, color: od.color, border: `1px solid ${od.border}` }}>
                      {od.days}d
                    </Badge>
                  </div>

                  <div className="text-sm font-semibold text-foreground">{job.customer_name}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {job.job_type} · {job.assigned_engineer || "Unassigned"}
                  </div>

                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-xl font-bold font-mono" style={{ color: "#D97706" }}>{eur(bal)}</span>
                    <span className="text-xs text-muted-foreground">of {eur(rev)}</span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1 text-xs font-bold text-white"
                      style={{ background: "#4A86E8" }}
                      onClick={() => window.location.href = `/jobs/${job.id}`}
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Pay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 text-xs font-bold"
                      disabled={isSending}
                      onClick={() => handleSendLink(job)}
                    >
                      {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                      {isSending ? "…" : "Link"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 text-xs font-bold"
                      disabled={reminderAlreadySent}
                      onClick={() => setReminderModalJob(job)}
                      style={!reminderAlreadySent ? { borderColor: "#F59E0B", color: "#92400E" } : undefined}
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {reminderAlreadySent ? "Sent" : "14d"}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Mobile Totals */}
            <div className="rounded-xl p-4" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <div className="flex justify-between text-sm font-extrabold" style={{ color: "#92400E" }}>
                <span>Total Outstanding</span>
                <span style={{ color: "#D97706" }}>{eur(totals.balance)}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Desktop Table */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-extrabold">Job Ref</TableHead>
                  <TableHead className="font-extrabold">Date</TableHead>
                  <TableHead className="font-extrabold">Customer</TableHead>
                  <TableHead className="font-extrabold">Job Type</TableHead>
                  <TableHead className="font-extrabold">Engineer</TableHead>
                  <TableHead className="font-extrabold text-right">Job Total</TableHead>
                  <TableHead className="font-extrabold text-right">Deposit Paid</TableHead>
                  <TableHead className="font-extrabold text-right">Balance Due</TableHead>
                  <TableHead className="font-extrabold text-center">Outstanding</TableHead>
                  <TableHead className="font-extrabold text-center">Status</TableHead>
                  <TableHead className="font-extrabold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const rev = job.revenue || 0;
                  const dep = job.deposit_amount || 0;
                  const bal = outstandingBalanceAmount(job);
                  const isSending = sendingId === job.id;
                  const reminderAlreadySent = job.reminder_14day_sent || sentReminders.has(job.id);
                  const od = getOutstandingDays(job.invoiced_at);

                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono font-bold">
                        <a href={`/jobs/${job.id}`} className="text-primary hover:underline">
                          {jobRefStr(job)}
                        </a>
                      </TableCell>
                      <TableCell>
                        {job.scheduled_date
                          ? format(new Date(job.scheduled_date + "T00:00:00"), "dd/MM/yy")
                          : "—"}
                      </TableCell>
                      <TableCell className="font-semibold">{job.customer_name}</TableCell>
                      <TableCell>{job.job_type}</TableCell>
                      <TableCell>{job.assigned_engineer || "—"}</TableCell>
                      <TableCell className="text-right font-bold">{eur(rev)}</TableCell>
                      <TableCell className="text-right font-semibold" style={{ color: "#16A34A" }}>
                        {eur(dep)}
                      </TableCell>
                      <TableCell className="text-right font-bold" style={{ color: "#D97706" }}>
                        {eur(bal)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="rounded-full text-xs font-bold px-2.5 py-0.5" style={{ background: od.bg, color: od.color, border: `1px solid ${od.border}` }}>
                          {od.days}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {reminderAlreadySent ? (
                          <Badge
                            className="rounded-full text-xs font-bold px-2.5 py-0.5"
                            style={{ background: "#DBEAFE", color: "#1E40AF", border: "1px solid #93C5FD" }}
                          >
                            Reminder Sent
                          </Badge>
                        ) : (
                          <Badge
                            className="rounded-full text-xs font-bold px-2.5 py-0.5"
                            style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
                          >
                            Balance Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="gap-1 text-xs font-bold text-white"
                            style={{ background: "#4A86E8" }}
                            onClick={() => window.location.href = `/jobs/${job.id}`}
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Take Payment
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs font-bold"
                            disabled={isSending}
                            onClick={() => handleSendLink(job)}
                          >
                            {isSending ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                            ) : (
                              <><ExternalLink className="w-3.5 h-3.5" /> Send Link</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs font-bold"
                            disabled={reminderAlreadySent}
                            onClick={() => setReminderModalJob(job)}
                            style={!reminderAlreadySent ? { borderColor: "#F59E0B", color: "#92400E" } : undefined}
                          >
                            <Bell className="w-3.5 h-3.5" />
                            {reminderAlreadySent ? "Sent" : "14-Day Reminder"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow style={{ background: "#FFFBEB" }}>
                  <TableCell colSpan={5} className="text-right font-extrabold" style={{ color: "#92400E" }}>
                    TOTALS
                  </TableCell>
                  <TableCell className="text-right font-extrabold">{eur(totals.total)}</TableCell>
                  <TableCell className="text-right font-extrabold" style={{ color: "#16A34A" }}>
                    {eur(totals.deposit)}
                  </TableCell>
                  <TableCell className="text-right font-extrabold" style={{ color: "#D97706" }}>
                    {eur(totals.balance)}
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {/* Reminder Checklist Modal */}
      <ReminderChecklistModal
        open={!!reminderModalJob}
        onClose={() => setReminderModalJob(null)}
        job={
          reminderModalJob
            ? {
                id: reminderModalJob.id,
                customer_name: reminderModalJob.customer_name,
                receipt_number: reminderModalJob.receipt_number,
                invoiced_at: reminderModalJob.invoiced_at,
                balance_due: outstandingBalanceAmount(reminderModalJob),
                customer_phone: reminderModalJob.customer_phone,
                payment_status: reminderModalJob.payment_status,
              }
            : null
        }
        onConfirm={handleSendReminder}
      />
    </>
  );
};

export default OutstandingBalances;
