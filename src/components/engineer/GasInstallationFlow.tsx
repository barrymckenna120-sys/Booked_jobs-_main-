import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addToQueue } from "@/hooks/useRetryQueue";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, CheckCircle2, MessageSquare, AlertTriangle } from "lucide-react";

const STEPS = ["Details", "Appliance", "Readings", "Customer", "Engineer"];
const HEADER_BG = "#1e3a5f";
const ACCENT = "#4A86E8";

interface GasInstallationFlowProps {
  job: any;
  customer: any;
  engineerName: string;
  engineerRgi: string | null;
  engineerPhone?: string | null;
  onClose: () => void;
}

const ToggleGroup = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
    <div className="flex gap-2">
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`flex-1 h-11 rounded-xl text-sm font-extrabold border-2 transition-colors ${value === opt ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const SignatureCanvas = ({ onConfirm, onBack, title, subtitle }: { onConfirm: (dataUrl: string) => void; onBack: () => void; title: string; subtitle?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };
  const start = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); drawing.current = true; hasDrawn.current = true; const ctx = canvasRef.current!.getContext("2d")!; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.TouchEvent | React.MouseEvent) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current!.getContext("2d")!; const p = getPos(e); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#000"; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); hasDrawn.current = false; };
  useEffect(() => { const c = canvasRef.current; if (!c) return; const parent = c.parentElement!; c.width = parent.clientWidth; c.height = parent.clientHeight; }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex-1 mx-4 mb-2 border-2 border-border rounded-xl bg-white relative overflow-hidden touch-none">
        <canvas ref={canvasRef} className="w-full h-full" onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div className="absolute bottom-8 left-6 right-6 border-b border-muted-foreground/30" />
        <span className="absolute bottom-2 left-6 text-[10px] text-muted-foreground">Sign above the line</span>
      </div>
      <div className="flex gap-2 px-4 pb-6 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 font-bold gap-1"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Button variant="outline" onClick={clear} className="h-12 font-bold gap-1"><RotateCcw className="w-4 h-4" /> Clear</Button>
        <Button onClick={() => { if (!hasDrawn.current) return; onConfirm(canvasRef.current!.toDataURL("image/png")); }} className="flex-1 h-12 font-bold gap-1" style={{ backgroundColor: ACCENT }}>
          <Check className="w-4 h-4" /> Confirm
        </Button>
      </div>
    </div>
  );
};

const GasInstallationFlow: React.FC<GasInstallationFlowProps> = ({ job, customer, engineerName, engineerRgi, engineerPhone, onClose }) => {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [certNumber, setCertNumber] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // Step 1 — Premises & Supply
  const [gprn, setGprn] = useState(customer?.gprn || "");
  const [gasType, setGasType] = useState("Nat Gas");
  const [meterSerial, setMeterSerial] = useState("");
  const [meterType, setMeterType] = useState("");
  const [workCarriedOut, setWorkCarriedOut] = useState("");
  const [workCarriedOutOther, setWorkCarriedOutOther] = useState("");

  // Step 2 — Pipework & Appliance
  const [pipeworkMaterial, setPipeworkMaterial] = useState("Copper");
  const [pipeworkSize, setPipeworkSize] = useState("");
  const [pipeworkLength, setPipeworkLength] = useState("");
  const [appliancesConnected, setAppliancesConnected] = useState("");
  const [safetyChecks, setSafetyChecks] = useState({
    tightness_test: false,
    purge_complete: false,
    ventilation: false,
    flue_inspected: false,
    appliance_location: false,
    soundness_test: false,
  });

  // Step 3 — Readings & Declaration
  const [gasPressure, setGasPressure] = useState("");
  const [readings, setReadings] = useState({ co_ppm: "", co2_pct: "", ratio: "" });
  const [traineeNumber, setTraineeNumber] = useState("N/A");
  const [hazardIssued, setHazardIssued] = useState("No");
  const [hazardNo, setHazardNo] = useState("");
  const [hazardReason, setHazardReason] = useState("");

  // Signatures
  const [customerSig, setCustomerSig] = useState<string | null>(null);

  const generateCertNumber = (prefix: string) => {
    const year = new Date().getFullYear();
    const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
    return `${prefix}-${year}-${rand}`;
  };

  const handleSubmit = async (engSigUrl: string) => {
    setSaving(true);
    const { data: settingsRow } = await supabase
      .from("settings")
      .select("cert_prefix")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();
    const prefix = ((settingsRow as any)?.cert_prefix || "").trim() || "CERT";
    const cn = generateCertNumber(prefix);
    const today = new Date().toISOString().split("T")[0];

    const certData = {
      organisation_id: job.organisation_id,
      job_id: job.id,
      customer_id: customer.id,
      cert_number: cn,
      checks: {
        tightness_test: { status: safetyChecks.tightness_test ? "pass" : "unchecked", note: "" },
        purge_complete: { status: safetyChecks.purge_complete ? "pass" : "unchecked", note: "" },
        ventilation: { status: safetyChecks.ventilation ? "pass" : "unchecked", note: "" },
        flue_inspected: { status: safetyChecks.flue_inspected ? "pass" : "unchecked", note: "" },
        appliance_location: { status: safetyChecks.appliance_location ? "pass" : "unchecked", note: "" },
        soundness_test: { status: safetyChecks.soundness_test ? "pass" : "unchecked", note: "" },
      } as any,
      notes: {
        cert_type: "gas_installation_new_meter",
        gprn,
        gas_type: gasType,
        meter_serial: meterSerial,
        meter_type: meterType,
        work_carried_out: workCarriedOut === "Other" ? workCarriedOutOther.trim() : workCarriedOut,
        pipework_material: pipeworkMaterial,
        pipework_size: pipeworkSize,
        pipework_length: pipeworkLength,
        appliances_connected: appliancesConnected,
        gas_pressure: gasPressure,
        trainee_number: traineeNumber,
        hazard_issued: hazardIssued,
        hazard_no: hazardNo,
        hazard_reason: hazardReason,
        date_of_test: today,
        date_of_issue: today,
      } as any,
      readings: {
        co_ppm: readings.co_ppm,
        co2_pct: readings.co2_pct,
        ratio: readings.ratio,
      } as any,
      customer_sig_url: customerSig,
      engineer_sig_url: engSigUrl,
    };

    const { data: insertedRow, error } = await supabase
      .from("certificates" as any)
      .insert(certData as any)
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      console.error("❌ Certificate insert failed, queuing for retry:", error.message, error);
      addToQueue({
        table: "certificates",
        operation: "insert",
        payload: certData as any,
      });
      toast({
        title: "No connection",
        description: "Certificate saved and will sync automatically when back online",
        variant: "destructive",
      });
    } else {
      const newCertId = (insertedRow as any)?.id;
      console.log("✅ Certificate inserted successfully. newCertId:", newCertId, "insertedRow:", insertedRow);
      setCertNumber(cn);
      setCertId(newCertId);
      setStep(5);

      if (newCertId) {
        console.log("🚀 Invoking generate-gas-install-pdf with certificate_id:", newCertId);
        supabase.functions.invoke("generate-gas-install-pdf", {
          body: { certificate_id: newCertId },
        }).then((res) => {
          console.log("📄 generate-gas-install-pdf response:", res.data, "error:", res.error);
        }).catch((err) => console.error("❌ PDF generation invoke error:", err));

        const poll = setInterval(async () => {
          const { data } = await supabase.from("certificates" as any).select("pdf_url").eq("id", newCertId).single();
          if ((data as any)?.pdf_url) {
            const url = (data as any).pdf_url;
            setPdfUrl(url);
            clearInterval(poll);

            setWhatsappStatus("sending");
            try {
              const { data: waData, error: waError } = await supabase.functions.invoke("send-certificate-whatsapp", {
                body: { certificate_id: newCertId },
              });
              if (waError || !waData?.success) setWhatsappStatus("failed");
              else setWhatsappStatus("sent");
            } catch { setWhatsappStatus("failed"); }
          }
        }, 3000);
        setTimeout(() => clearInterval(poll), 60000);
      }
    }
  };

  const ProgressBar = () => (
    <div className="flex items-center px-4 py-3 gap-1" style={{ backgroundColor: HEADER_BG }}>
      {STEPS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div className="h-1 w-full rounded-full transition-colors" style={{ backgroundColor: i <= step ? ACCENT : "rgba(255,255,255,0.2)" }} />
          <span className="text-[9px] font-bold tracking-wider" style={{ color: i <= step ? "#fff" : "rgba(255,255,255,0.4)" }}>{label}</span>
        </div>
      ))}
    </div>
  );

  if (step === 5) {
    return createPortal(
      <div className="fixed inset-0 z-[900] bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ACCENT}20` }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: ACCENT }} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">Certificate Created</h1>
        <p className="text-lg font-bold" style={{ color: ACCENT }}>{certNumber}</p>
        <p className="text-muted-foreground">{customer.name}</p>
        <p className="text-sm text-muted-foreground">Gas Installation / New Meter</p>

        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#22c55e" }}>
            <CheckCircle2 className="w-4 h-4" /> PDF Ready — View
          </a>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> ⏳ Generating PDF…
          </div>
        )}

        {whatsappStatus === "sending" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Sending to customer…</div>
        )}
        {whatsappStatus === "sent" && (
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#22c55e" }}><MessageSquare className="w-4 h-4" /> 📱 Sent to customer via WhatsApp</div>
        )}
        {whatsappStatus === "failed" && (
          <div className="flex items-center gap-2 text-sm font-bold text-destructive"><AlertTriangle className="w-4 h-4" /> WhatsApp send failed — check Message Log</div>
        )}

        <Button onClick={onClose} className="mt-4 h-12 px-8 font-bold" style={{ backgroundColor: ACCENT }}>Back to Job</Button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[900] bg-background flex flex-col overflow-hidden">
      <ProgressBar />

      <div className="flex-1 overflow-y-auto">
        {/* Step 1 — Details + Premises & Supply */}
        {step === 0 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Gas Installation / New Meter</h2>

            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pre-filled from job record</p>
              {([
                ["Customer Name", customer?.name],
                ["Address", customer?.address],
                ["Eircode", customer?.eircode],
                ["Phone", customer?.phone],
                ["Engineer", engineerName],
                ["RGI Number", engineerRgi || "—"],
                ["Date", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-bold text-foreground text-right max-w-[60%]">{val || "—"}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Supply Details</p>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">GPRN</Label>
                <Input value={gprn} onChange={(e) => setGprn(e.target.value)} placeholder="Enter GPRN" className="h-11" />
              </div>
              <ToggleGroup label="Gas Type" options={["Nat Gas", "LP Gas"]} value={gasType} onChange={setGasType} />
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Meter Serial Number</Label>
                <Input value={meterSerial} onChange={(e) => setMeterSerial(e.target.value)} placeholder="Enter meter serial" className="h-11" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Meter Type</Label>
                <Input value={meterType} onChange={(e) => setMeterType(e.target.value)} placeholder="e.g. Diaphragm, Rotary" className="h-11" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Work Carried Out</p>
              <Select value={workCarriedOut} onValueChange={setWorkCarriedOut}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select work type" />
                </SelectTrigger>
                <SelectContent className="z-[950]">
                  <SelectItem value="New Gas Connection">New Gas Connection</SelectItem>
                  <SelectItem value="New Meter Installation">New Meter Installation</SelectItem>
                  <SelectItem value="Meter Replacement">Meter Replacement</SelectItem>
                  <SelectItem value="Gas Pipe Extension">Gas Pipe Extension</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {workCarriedOut === "Other" && (
                <Input value={workCarriedOutOther} onChange={(e) => setWorkCarriedOutOther(e.target.value)} placeholder="Describe the work carried out" className="h-11" />
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Pipework & Appliance + Safety Checks */}
        {step === 1 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Pipework & Safety Checks</h2>

            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pipework Details</p>
              <ToggleGroup label="Pipework Material" options={["Copper", "CSST", "Other"]} value={pipeworkMaterial} onChange={setPipeworkMaterial} />
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pipework Size (mm)</Label>
                <Input value={pipeworkSize} onChange={(e) => setPipeworkSize(e.target.value)} placeholder="e.g. 15, 22, 28" className="h-11" inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pipework Length (m)</Label>
                <Input value={pipeworkLength} onChange={(e) => setPipeworkLength(e.target.value)} placeholder="e.g. 12" className="h-11" inputMode="decimal" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Appliances Connected</p>
              <Textarea value={appliancesConnected} onChange={(e) => setAppliancesConnected(e.target.value)} placeholder="e.g. Boiler, Hob, Cooker" className="min-h-[60px]" />
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Safety Checks</p>
              {([
                ["tightness_test", "Tightness test completed"],
                ["purge_complete", "Purge completed"],
                ["ventilation", "Adequate permanent ventilation"],
                ["flue_inspected", "Flue inspected and adequate"],
                ["appliance_location", "Appliance location correct"],
                ["soundness_test", "Soundness test pass"],
              ] as [keyof typeof safetyChecks, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 cursor-pointer">
                  <Checkbox checked={safetyChecks[key]} onCheckedChange={(checked) => setSafetyChecks((prev) => ({ ...prev, [key]: !!checked }))} />
                  <span className="text-sm font-bold text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Gas Readings + Declaration */}
        {step === 2 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Readings & Declaration</h2>

            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gas Pressure</p>
              <div className="bg-card border border-border rounded-2xl p-3 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gas Pressure (mbar)</Label>
                <Input inputMode="decimal" value={gasPressure} onChange={(e) => setGasPressure(e.target.value)} className="h-14 text-2xl font-extrabold text-center border-0 bg-transparent p-0" placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {([
                ["co_ppm", "CO (ppm)"],
                ["co2_pct", "CO₂ (%)"],
                ["ratio", "CO/CO₂ Ratio"],
              ] as [keyof typeof readings, string][]).map(([key, label]) => (
                <div key={key} className="bg-card border border-border rounded-2xl p-3 space-y-1">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
                  <Input inputMode="decimal" value={readings[key]} onChange={(e) => setReadings((r) => ({ ...r, [key]: e.target.value }))} className="h-14 text-2xl font-extrabold text-center border-0 bg-transparent p-0" placeholder="0" />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Declaration</p>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trainee Number</Label>
                <Input value={traineeNumber} onChange={(e) => setTraineeNumber(e.target.value)} className="h-11" />
              </div>
              <ToggleGroup label="Notice of Hazard Issued" options={["Yes", "No"]} value={hazardIssued} onChange={setHazardIssued} />
              {hazardIssued === "Yes" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Hazard No.</Label>
                    <Input value={hazardNo} onChange={(e) => setHazardNo(e.target.value)} className="h-11" placeholder="e.g. NZ-2026-0001" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reason</Label>
                    <Textarea value={hazardReason} onChange={(e) => setHazardReason(e.target.value)} className="min-h-[60px]" placeholder="Describe the reason…" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Customer Signature */}
        {step === 3 && (
          <SignatureCanvas title="Customer Signature" subtitle="Hand phone to customer"
            onBack={() => setStep(2)} onConfirm={(url) => { setCustomerSig(url); setStep(4); }} />
        )}

        {/* Step 5 — Engineer Signature */}
        {step === 4 && (
          <SignatureCanvas title="Engineer Signature"
            subtitle={`${engineerName}${engineerRgi ? ` — RGI: ${engineerRgi}` : ""}`}
            onBack={() => setStep(3)} onConfirm={(url) => handleSubmit(url)} />
        )}
      </div>

      {/* Bottom nav for steps 0-2 */}
      {step <= 2 && (
        <div className="flex gap-2 px-4 pb-6 pt-3 border-t border-border bg-background">
          <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(step - 1)} className="flex-1 h-12 font-bold gap-1">
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button onClick={() => {
            if (step === 0 && !workCarriedOut) {
              toast({ title: "Please select the type of work carried out", variant: "destructive" });
              return;
            }
            if (step === 0 && workCarriedOut === "Other" && !workCarriedOutOther.trim()) {
              toast({ title: "Please specify the work carried out", variant: "destructive" });
              return;
            }
            setStep(step + 1);
          }} className="flex-1 h-12 font-bold gap-1" style={{ backgroundColor: ACCENT }}>
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {saving && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-[950]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: ACCENT }} />
            <p className="text-sm font-bold text-foreground">Saving certificate…</p>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default GasInstallationFlow;
