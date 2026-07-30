import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, FileText, AlertTriangle, Loader2, Eye, Download, Send, Plus, CheckCircle2, Lock } from "lucide-react";
import CertificateFlow from "@/components/engineer/CertificateFlow";
import HazardNotificationFlow from "@/components/engineer/HazardNotificationFlow";
import Cert2Flow from "@/components/engineer/Cert2Flow";
import Cert3Flow from "@/components/engineer/Cert3Flow";
import GasInstallationFlow from "@/components/engineer/GasInstallationFlow";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

const HAZARD_LABELS: Record<string, string> = { type_a: "A", type_b: "B", type_c: "C" };

const EngineerCertificates = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [hazards, setHazards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [showHazard, setShowHazard] = useState(false);
  const [showCert2, setShowCert2] = useState(false);
  const [showCert3, setShowCert3] = useState(false);
  const [showGasInstall, setShowGasInstall] = useState(false);
  const [engineerInfo, setEngineerInfo] = useState<{ name: string; rgi_number: string | null; phone: string | null }>({ name: "", rgi_number: null, phone: null });
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (user && id) {
      fetchData();
      supabase.from("engineers").select("name, rgi_number, phone").eq("auth_user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) setEngineerInfo({ name: data.name || "", rgi_number: (data as any).rgi_number || null, phone: (data as any).phone || null }); });
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) setSettings(data); });
    }
  }, [user, id]);

  const fetchData = async () => {
    setLoading(true);
    const [jobRes, certRes, hazRes] = await Promise.all([
      supabase.from("service_calls").select("*").eq("id", id).maybeSingle(),
      supabase.from("certificates").select("*").eq("job_id", id),
      supabase.from("hazard_notifications").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    ]);

    if (!jobRes.data) { toast({ title: "Job not found", variant: "destructive" }); navigate("/engineer/today"); return; }
    setJob(jobRes.data);
    setCertificates(certRes.data || []);
    setHazards(hazRes.data || []);

    const { data: custData } = await supabase.from("customers").select("*").eq("id", jobRes.data.customer_id).maybeSingle();
    if (custData) setCustomer(custData);
    setLoading(false);
  };

  const handleResendCert = async (pdfUrl: string, customerName: string) => {
    if (!pdfUrl) { toast({ title: "No PDF available", variant: "destructive" }); return; }
    toast({ title: "Opening WhatsApp..." });
    const msg = encodeURIComponent(`Hi ${customerName}, please find your Gas Safety Certificate from ${engineerInfo.name || "your engineer"}.`);
    window.open(`https://wa.me/${customer?.phone?.replace(/[^0-9]/g, "")}?text=${msg}`, "_blank");
  };

  const handleResendHazard = async (pdfUrl: string, customerName: string) => {
    if (!pdfUrl) { toast({ title: "No PDF available", variant: "destructive" }); return; }
    toast({ title: "Opening WhatsApp..." });
    const msg = encodeURIComponent(`Hi ${customerName}, please find attached your Gas Installation Notification of Hazard/Non-Conformance from ${engineerInfo.name || "your engineer"}.`);
    window.open(`https://wa.me/${customer?.phone?.replace(/[^0-9]/g, "")}?text=${msg}`, "_blank");
  };

  if (authLoading || loading) {
    return <div className="max-w-[430px] mx-auto min-h-screen bg-secondary flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!job || !customer) return null;

  const allDocs = [
    ...certificates.map(c => {
      const certType = (c.notes as any)?.cert_type;
      const subType = certType === "declaration_of_conformance" ? "cert2" : certType === "domestic_safety_service" ? "cert3" : certType === "gas_installation_new_meter" ? "gas_install" : certType === "gas_safety_service" ? "cert3" : "cert1";
      return {
        type: "certificate" as const,
        subType,
        id: c.id, ref: c.cert_number || "—", pdfUrl: c.pdf_url, createdAt: c.created_at, hazardTypes: null, sent: !!c.pdf_url,
        gprn: ((c.notes as any)?.gprn as string) || null,
      };
    }),
    ...hazards.map(h => ({ type: "hazard" as const, subType: "hazard", id: h.id, ref: h.ref_number || "—", pdfUrl: h.pdf_url, createdAt: h.created_at, hazardTypes: h.hazard_types, sent: !!h.pdf_url, gprn: null as string | null })),

  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const hasCert = certificates.length > 0;
  const statusCfg: Record<string, { bg: string; color: string; label: string }> = {
    Scheduled: { bg: "bg-primary/10", color: "text-primary", label: "Scheduled" },
    Booked: { bg: "bg-primary/10", color: "text-primary", label: "Booked" },
    "In Progress": { bg: "bg-warning/10", color: "text-warning", label: "In Progress" },
    Completed: { bg: "bg-success/10", color: "text-success", label: "Completed" },
    Cancelled: { bg: "bg-destructive/10", color: "text-destructive", label: "Cancelled" },
  };
  const s = statusCfg[job.status] || statusCfg.Scheduled;

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-secondary pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-4 pt-12 pb-5 relative overflow-hidden">
        <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-white/[0.07] pointer-events-none" />
        <button onClick={() => navigate(`/engineer/job/${id}`)} className="flex items-center gap-1.5 text-white/80 text-sm font-semibold mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-xl font-extrabold text-white">Certificates</div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Job summary strip */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[15px] font-extrabold text-foreground">{customer.name}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">{customer.address}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {job.scheduled_date ? new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "No date"}
              </div>
            </div>
            <span className={`${s.bg} ${s.color} rounded-full px-3 py-1 text-xs font-bold shrink-0`}>{s.label}</span>
          </div>
        </div>

        {/* Issued Documents */}
        <div className="text-[13px] font-extrabold text-foreground uppercase tracking-wider">Issued Documents</div>

        {allDocs.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
            <div className="text-sm font-bold text-muted-foreground">No documents issued yet.</div>
          </div>
        ) : (
          allDocs.map(doc => (
            <div key={doc.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: doc.type === "hazard" ? "#FEE2E2" : "#EBF2FF" }}>
                  {doc.type === "hazard" ? <AlertTriangle className="w-5 h-5 text-destructive" /> : <FileText className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-extrabold text-foreground">
                    {doc.type === "hazard" ? "Notification of Hazard" : doc.subType === "gas_install" ? "Gas Installation / New Meter" : doc.subType === "cert2" ? "Declaration of Conformance" : doc.subType === "cert3" ? "Domestic Safety / Service" : "RGI Gas Certificate"}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-semibold">{doc.ref}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {engineerInfo.name ? ` · ${engineerInfo.name}` : ""}
                  </div>
                  {/* Hazard type badges */}
                  {doc.type === "hazard" && doc.hazardTypes && (
                    <div className="flex gap-1 mt-1">
                      {(Array.isArray(doc.hazardTypes) ? doc.hazardTypes : []).map((t: string) => (
                        <span key={t} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                          {HAZARD_LABELS[t] || t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Sent status */}
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${doc.sent ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                  {doc.sent ? "Sent ✓" : "Pending"}
                </span>
              </div>
              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9"
                  disabled={!doc.pdfUrl}
                  onClick={() => doc.pdfUrl && window.open(doc.pdfUrl, "_blank")}
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9"
                  disabled={!doc.pdfUrl}
                  onClick={() => {
                    if (!doc.pdfUrl) return;
                    const a = document.createElement("a");
                    a.href = doc.pdfUrl;
                    a.download = `${doc.ref}.pdf`;
                    a.click();
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9 text-success"
                  disabled={!doc.pdfUrl}
                  onClick={() => doc.type === "certificate"
                    ? handleResendCert(doc.pdfUrl!, customer.name)
                    : handleResendHazard(doc.pdfUrl!, customer.name)
                  }
                >
                  <Send className="w-3.5 h-3.5" /> Resend
                </Button>
              </div>
            </div>
          ))
        )}

        {/* Create New Certificate */}
        <Button
          className="w-full h-14 text-base font-extrabold gap-2"
          onClick={() => setShowCreateSheet(true)}
        >
          <Plus className="w-5 h-5" /> Create New Certificate
        </Button>
      </div>

      {/* Create Certificate Bottom Sheet */}
      <Sheet open={showCreateSheet} onOpenChange={setShowCreateSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh]">
          <SheetHeader>
            <SheetTitle className="text-lg font-extrabold">Create New Certificate</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            {[
              { label: "Gas Installation / New Meter", desc: "New gas connection · new meter installation", icon: <FileText className="w-5 h-5 text-primary" />, bg: "#EBF2FF", action: () => { setShowCreateSheet(false); setShowGasInstall(true); } },
              { label: "Boiler Service", desc: "Annual service · safety checks · gas readings", icon: <FileText className="w-5 h-5 text-primary" />, bg: "#EBF2FF", action: () => { setShowCreateSheet(false); setShowCertificate(true); } },
              { label: "Notification of Hazard", desc: "Non-conformance · appliance or gas isolation", icon: <AlertTriangle className="w-5 h-5 text-destructive" />, bg: "#FEE2E2", action: () => { setShowCreateSheet(false); setShowHazard(true); } },
              { label: "Declaration of Conformance", desc: "RGI conformance declaration for existing installations", icon: <FileText className="w-5 h-5 text-primary" />, bg: "#EBF2FF", action: () => { setShowCreateSheet(false); setShowCert2(true); } },
              { label: "Domestic Safety / Service", desc: "Non-boiler appliances · repairs · safety checks", icon: <FileText className="w-5 h-5 text-primary" />, bg: "#EBF2FF", action: () => { setShowCreateSheet(false); setShowCert3(true); } },
            ].map((item) => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
                onClick={item.action}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: item.bg }}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-extrabold text-foreground">{item.label}</span>
                  <div className="text-[12px] text-muted-foreground">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Certificate & Hazard Flows */}
      {showCertificate && (
        <CertificateFlow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowCertificate(false); fetchData(); }}
        />
      )}
      {showHazard && (
        <HazardNotificationFlow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowHazard(false); fetchData(); }}
        />
      )}
      {showCert2 && (
        <Cert2Flow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowCert2(false); fetchData(); }}
        />
      )}
      {showCert3 && (
        <Cert3Flow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowCert3(false); fetchData(); }}
        />
      )}
      {showGasInstall && job && customer && (
        <ErrorBoundary>
          <GasInstallationFlow
            job={job}
            customer={customer}
            engineerName={engineerInfo.name || ""}
            engineerRgi={engineerInfo.rgi_number || ""}
            engineerPhone={engineerInfo.phone || ""}
            onClose={() => { setShowGasInstall(false); fetchData(); }}
          />
        </ErrorBoundary>
      )}
    </div>
  );
};

export default EngineerCertificates;
