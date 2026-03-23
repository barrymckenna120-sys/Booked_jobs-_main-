import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type Job = {
  id: string;
  scheduled_date: string | null;
  job_type: string;
  assigned_engineer: string | null;
  revenue: number | null;
  status: string;
  deposit_paid: boolean;
  receipt_number: string | null;
};

type Certificate = {
  id: string;
  cert_number: string | null;
  created_at: string | null;
  pdf_url: string | null;
  job_id: string | null;
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
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [jobsRes, certsRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("id, scheduled_date, job_type, assigned_engineer, revenue, status, deposit_paid, receipt_number")
          .eq("customer_id", customerId)
          .order("scheduled_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("certificates")
          .select("id, cert_number, created_at, pdf_url, job_id")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);
      setJobs((jobsRes.data || []) as Job[]);
      setCertificates((certsRes.data || []) as Certificate[]);
      setLoading(false);
    };
    fetchData();
  }, [customerId]);

  const total = jobs.reduce((sum, j) => sum + (j.revenue || 0), 0);

  if (loading) return null;

  return (
    <div className="space-y-4">
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
                      <TableHead>Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => {
                      const ps = paymentStatus(j);
                      return (
                        <TableRow key={j.id} className="cursor-pointer" onClick={() => navigate(`/jobs/${j.id}`)}>
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
                          <TableCell>
                            {j.receipt_number ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/receipt/${j.id}`); }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                              >
                                <Receipt className="w-3.5 h-3.5" /> {j.receipt_number}
                              </button>
                            ) : null}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📄 Certificates</CardTitle>
        </CardHeader>
        <CardContent>
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certificates issued yet.</p>
          ) : (
            <div className="space-y-3">
              {certificates.map((cert) => {
                const engineer = jobs.find((j) => j.id === cert.job_id)?.assigned_engineer;
                return (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{cert.cert_number || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {cert.created_at
                            ? new Date(cert.created_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                          {engineer ? ` · ${engineer}` : ""}
                        </p>
                      </div>
                    </div>
                    {cert.pdf_url ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs font-bold"
                        onClick={() => window.open(cert.pdf_url!, "_blank")}
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View Certificate
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">PDF pending…</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ServiceHistory;
