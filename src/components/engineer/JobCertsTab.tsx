import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, ExternalLink, PenLine } from "lucide-react";
import GasInstallationCertForm from "./GasInstallationCertForm";

interface JobCertsTabProps {
  job: any;
  customer: any;
  engineerInfo: { name: string; rgi_number: string | null };
}

const JobCertsTab: React.FC<JobCertsTabProps> = ({ job, customer, engineerInfo }) => {
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCert, setEditCert] = useState<any>(null);

  const fetchCerts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cert2_certificates")
      .select("*")
      .eq("service_call_id", job.id)
      .order("created_at", { ascending: false });
    setCerts(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCerts(); }, [job.id]);

  if (showForm) {
    return (
      <GasInstallationCertForm
        job={job}
        customer={customer}
        engineerInfo={engineerInfo}
        existingCert={editCert}
        onClose={() => { setShowForm(false); setEditCert(null); }}
        onSaved={() => { setShowForm(false); setEditCert(null); fetchCerts(); }}
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
      {certs.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No certificates for this job yet</p>
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
          {certs.map((cert) => (
            <div key={cert.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-foreground">Gas Installation / New Meter</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(cert.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                  cert.status === "complete" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>
                  {cert.status === "complete" ? "Complete" : "Draft"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditCert(cert); setShowForm(true); }}
                >
                  <PenLine className="w-4 h-4" />
                </Button>
                {cert.pdf_url && (
                  <Button size="sm" variant="outline" onClick={() => window.open(cert.pdf_url, "_blank")}>
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
            <FileText className="w-4 h-4" /> New Gas Installation Cert
          </Button>
        </>
      )}
    </div>
  );
};

export default JobCertsTab;
