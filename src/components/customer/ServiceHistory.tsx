import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

type CertificateDoc = {
  id: string;
  cert_number: string | null;
  created_at: string | null;
  pdf_url: string | null;
  job_id: string | null;
  cert_type_label: string;
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

interface ServiceHistoryProps {
  customerId: string;
  onCountsReady?: (jobCount: number, certCount: number) => void;
}

const ServiceHistory = ({ customerId, onCountsReady }: ServiceHistoryProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [certificates, setCertificates] = useState<CertificateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [jobsRes, cert1Res, hazardRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("id, scheduled_date, job_type, assigned_engineer, revenue, status, deposit_paid, receipt_number")
          .eq("customer_id", customerId)
          .order("scheduled_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("certificates")
          .select("id, cert_number, created_at, pdf_url, job_id, notes")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("hazard_notifications")
          .select("id, ref_number, created_at, pdf_url, job_id")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);

      const fetchedJobs = (jobsRes.data || []) as Job[];
      setJobs(fetchedJobs);

      const jobIds = fetchedJobs.map((j) => j.id);
      let cert2Docs: CertificateDoc[] = [];
      if (jobIds.length > 0) {
        const { data: cert2Data } = await supabase
          .from("cert2_certificates")
          .select("id, cert_type, created_at, pdf_url, service_call_id")
          .in("service_call_id", jobIds);
        cert2Docs = (cert2Data || []).map((c: any) => ({
          id: c.id,
          cert_number: null,
          created_at: c.created_at,
          pdf_url: c.pdf_url,
          job_id: c.service_call_id,
          cert_type_label: c.cert_type === "declaration_of_conformance" ? "Declaration of Conformance" : c.cert_type === "gas_safety_service" ? "Declaration of Performance" : "Gas Installation / New Meter",
        }));
      }

      const cert1Docs: CertificateDoc[] = (cert1Res.data || []).map((c: any) => {
        const certNumber = c.cert_number || "";
        let certTypeLabel = "Gas Certificate";
        
        if (certNumber.startsWith("GI-")) {
          certTypeLabel = "Gas Installation / New Meter";
        } else if (certNumber.startsWith("DS-")) {
          certTypeLabel = "Domestic Safety / Service";
        } else if (certNumber.startsWith("DC-")) {
          certTypeLabel = "Declaration of Conformance";
        } else if (certNumber.startsWith("KN-")) {
          certTypeLabel = "Boiler Service";
        }
        
        return {
          id: c.id,
          cert_number: c.cert_number,
          created_at: c.created_at,
          pdf_url: c.pdf_url,
          job_id: c.job_id,
          cert_type_label: certTypeLabel,
        };
      });

      const hazardDocs: CertificateDoc[] = (hazardRes.data || []).map((h: any) => ({
        id: h.id,
        cert_number: h.ref_number,
        created_at: h.created_at,
        pdf_url: h.pdf_url,
        job_id: h.job_id,
        cert_type_label: "Notification of Hazard",
      }));

      const allCerts = [...cert1Docs, ...cert2Docs, ...hazardDocs].sort(
        (a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
      );
      setCertificates(allCerts);
      setLoading(false);
      onCountsReady?.(fetchedJobs.length, allCerts.length);
    };
    fetchData();
  }, [customerId]);

  const total = jobs.reduce((sum, j) => sum + (j.revenue || 0), 0);

  if (loading) return null;

  return (
    <div className="space-y-6">
      {/* Service History */}
      <div>
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
                              onClick={(e) => { e.stopPropagation(); navigate(`/receipt-view/${j.id}`); }}
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
      </div>

      {/* Certificates */}
      {certificates.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-3">📄 Certificates</p>
          <div className="space-y-3">
            {certificates.map((cert) => {
              const engineer = jobs.find((j) => j.id === cert.job_id)?.assigned_engineer;
              return (
                <div key={cert.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{cert.cert_type_label}</p>
                      <p className="text-xs text-muted-foreground">
                        {cert.cert_number || "—"}
                        {cert.created_at
                          ? ` · ${new Date(cert.created_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}`
                          : ""}
                        {engineer ? ` · ${engineer}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs font-bold"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (cert.cert_number) {
                        window.open(`https://kngasservices.bookedjobs.ie/certificates/${encodeURIComponent(cert.cert_number)}`, "_blank", "noopener,noreferrer");
                      } else if (cert.pdf_url) {
                        window.open(cert.pdf_url, "_blank", "noopener,noreferrer");
                      } else {
                        toast({ title: "No certificate available", description: "The PDF has not been generated yet.", variant: "destructive" });
                      }
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> {cert.pdf_url ? "View Certificate" : "PDF pending…"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceHistory;
