import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Job = {
  id: string;
  scheduled_date: string | null;
  job_type: string;
  assigned_engineer: string | null;
  revenue: number | null;
  status: string;
  deposit_paid: boolean;
};

const paymentStatus = (j: Job) => {
  if (j.status === "Completed" && j.deposit_paid) return "Paid";
  if (j.status === "Completed") return "Outstanding";
  if (j.status === "Invoiced") return "Invoiced";
  if (j.deposit_paid) return "Paid";
  return "Outstanding";
};

const paymentVariant = (s: string) => {
  if (s === "Paid") return "default" as const;
  if (s === "Invoiced") return "secondary" as const;
  return "destructive" as const;
};

const ServiceHistory = ({ customerId }: { customerId: string }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, scheduled_date, job_type, assigned_engineer, revenue, status, deposit_paid")
        .eq("customer_id", customerId)
        .order("scheduled_date", { ascending: false, nullsFirst: false });
      setJobs((data || []) as Job[]);
      setLoading(false);
    };
    fetch();
  }, [customerId]);

  const total = jobs.reduce((sum, j) => sum + (j.revenue || 0), 0);

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">🔧 Service History</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No service history yet.</p>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Engineer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => {
                    const ps = paymentStatus(j);
                    return (
                      <TableRow key={j.id}>
                        <TableCell className="whitespace-nowrap">
                          {j.scheduled_date
                            ? new Date(j.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                        </TableCell>
                        <TableCell>{j.job_type}</TableCell>
                        <TableCell>{j.assigned_engineer || "—"}</TableCell>
                        <TableCell className="text-right">
                          {j.revenue != null ? `€${j.revenue.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={paymentVariant(ps)} className="text-xs">{ps}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
              <span className="text-sm font-semibold">Total spent</span>
              <span className="text-sm font-bold">€{total.toFixed(2)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceHistory;
