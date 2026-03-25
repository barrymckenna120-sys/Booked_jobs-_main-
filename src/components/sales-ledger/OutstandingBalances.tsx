import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

type OutstandingJob = {
  id: string;
  scheduled_date: string | null;
  job_type: string;
  assigned_engineer: string | null;
  revenue: number | null;
  deposit_amount: number | null;
  customer_name: string;
};

const eur = (n: number) => `€${n.toFixed(2)}`;

const OutstandingBalances = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<OutstandingJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("service_calls")
      .select("id, scheduled_date, job_type, assigned_engineer, revenue, deposit_amount, deposit_paid, payment_status, customer_id, customers(name)")
      .eq("deposit_paid", true)
      .neq("payment_status", "paid")
      .not("status", "eq", "Cancelled")
      .order("scheduled_date", { ascending: false })
      .then(({ data: rows }) => {
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
                scheduled_date: r.scheduled_date,
                job_type: r.job_type,
                assigned_engineer: r.assigned_engineer,
                revenue: r.revenue,
                deposit_amount: r.deposit_amount,
                customer_name: r.customers?.name || "Unknown",
              }))
          );
        }
        setLoading(false);
      });
  }, [user]);

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
      acc.balance += rev - dep;
      return acc;
    },
    { total: 0, deposit: 0, balance: 0 }
  );

  const jobRef = (id: string) => "BJ-" + id.substring(0, 6).toUpperCase();

  return (
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

      {/* Table */}
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
              <TableHead className="font-extrabold text-center">Status</TableHead>
              <TableHead className="font-extrabold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const rev = job.revenue || 0;
              const dep = job.deposit_amount || 0;
              const bal = rev - dep;
              return (
                <TableRow key={job.id}>
                  <TableCell className="font-mono font-bold">
                    <a href={`/jobs/${job.id}`} className="text-primary hover:underline">
                      {jobRef(job.id)}
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
                    <Badge
                      className="rounded-full text-xs font-bold px-2.5 py-0.5"
                      style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
                    >
                      Balance Pending
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
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
                        onClick={() => window.location.href = `/jobs/${job.id}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Send Link
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
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
};

export default OutstandingBalances;
