import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, ExternalLink, PenLine, AlertTriangle } from "lucide-react";
import GasInstallationCertForm from "./GasInstallationCertForm";

interface JobCertsTabProps {
  job: any;
  customer: any;
  engineerInfo: { name: string; rgi_number: string | null };
}

interface CertDoc {
  id: string;
  type: "cert1" | "cert2" | "hazard";
  label: string;
  status: string;
  pdf_url: string | null;
  created_at: string;
  gprn: string | null;
}


const JobCertsTab: React.FC<JobCertsTabProps> = ({ job, customer, engineerInfo }) => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<CertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCert, setEditCert] = useState<any>(null);

  const closeAndReturnToJob = () => {
    setShowForm(false);
    setEditCert(null);
    navigate(-1);
  };

  const fetchDocs = async () => {
    setLoading(true);
    const [cert1Res, cert2Res, hazardRes] = await Promise.all([
      supabase.from("certificates").select("id, pdf_url, cert_number, created_at, notes").eq("job_id", job.id),
      supabase.from("cert2_certificates").select("id, pdf_url, status, created_at, cert_type, gprn").eq("service_call_id", job.id),
      supabase.from("hazard_notifications").select("id, pdf_url, ref_number, created_at").eq("job_id", job.id),
    ]);

    const allDocs: CertDoc[] = [
      ...(cert1Res.data || []).map((c: any) => {
        const certType = (c.notes as any)?.cert_type;
        const label = certType === "gas_safety_service" ? "Domestic Safety / Service" : certType === "domestic_safety_service" ? "Domestic Safety / Service" : certType === "gas_installation_new_meter" ? "Gas Installation / New Meter" : "Boiler Service";
        return { id: c.id, type: "cert1" as const, label, status: c.pdf_url ? "complete" : "draft", pdf_url: c.pdf_url, created_at: c.created_at, gprn: (c.notes as any)?.gprn || null };
      }),
      ...(cert2Res.data || []).map((c: any) => ({
        id: c.id, type: "cert2" as const,
        label: c.cert_type === "declaration_of_conformance" ? "Declaration of Conformance" : c.cert_type === "gas_safety_service" ? "Declaration of Performance" : "Gas Installation / New Meter",
        status: c.status || "draft", pdf_url: c.pdf_url, created_at: c.created_at, gprn: c.gprn || null,
      })),
      ...(hazardRes.data || []).map((h: any) => ({
        id: h.id, type: "hazard" as const, label: "Notification of Hazard",
        status: h.pdf_url ? "complete" : "draft", pdf_url: h.pdf_url, created_at: h.created_at, gprn: null,
      })),

    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setDocs(allDocs);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [job.id]);

  if (showForm) {
    return (
      <GasInstallationCertForm
        job={job}
        customer={customer}
        engineerInfo={engineerInfo}
        existingCert={editCert}
        onClose={closeAndReturnToJob}
        onSaved={closeAndReturnToJob}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No certificates issued yet</p>
          <Button
            className="w-full h-12 font-bold gap-2"
            style={{ backgroundColor: "#1e3a5f" }}
            onClick={() => { setEditCert(null); setShowForm(true); }}
          >
            <FileText className="w-4 h-4" /> New Gas Installation / New Meter
          </Button>
        </div>
      ) : (
        <>
          {docs.map((doc) => (
            <div key={doc.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  {doc.type === "hazard" && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                  {doc.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
                {doc.gprn && (
                  <div className="text-xs text-muted-foreground">GPRN {doc.gprn}</div>
                )}

                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                  doc.status === "complete" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>
                  {doc.status === "complete" ? "Complete" : "Draft"}
                </span>
              </div>
              <div className="flex gap-2">
                {doc.type === "cert2" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditCert({ id: doc.id }); setShowForm(true); }}
                  >
                    <PenLine className="w-4 h-4" />
                  </Button>
                )}
                {doc.pdf_url && (
                  <Button size="sm" variant="outline" onClick={() => window.open(doc.pdf_url!, "_blank")}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            className="w-full h-10 font-bold gap-2 mt-2"
            onClick={() => { setEditCert(null); setShowForm(true); }}
          >
            <FileText className="w-4 h-4" /> New Gas Installation / New Meter
          </Button>
        </>
      )}
    </div>
  );
};

export default JobCertsTab;
