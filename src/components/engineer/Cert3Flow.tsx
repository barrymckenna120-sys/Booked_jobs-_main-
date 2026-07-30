import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRetryQueue } from "@/hooks/useRetryQueue";
import { backfillCustomerGprn } from "@/lib/backfillCustomerGprn";

import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, CheckCircle2, MessageSquare, AlertTriangle, X } from "lucide-react";

const STEPS = ["Premises", "Appliances", "Readings", "Details", "Signature"];
const HEADER_BG = "#1e3a5f";
const ACCENT = "#4A86E8";

const APPLIANCE_ROWS = ["Hob", "Oven", "Cooker", "Fire", "Flueless Fire", "C/H Boiler", "Water Heater", "Pipework"];
const APPLIANCE_COLS = ["Repaired", "I.S. 813 / I.S. EN 1949", "Annex C – Serviced", "Annex E – Safety Check"];

interface Cert3FlowProps {
  job: any;
  customer: any;
  engineerName: string;
  engineerRgi: string | null;
  engineerPhone?: string | null;
  onClose: () => void;
}

// ─── Toggle ──────────────────────────────────────
const Toggle = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
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

// ─── YES/NO cell ──────────────────────────────────
const YesNoCell = ({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) => {
  const handleClick = () => {
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };
  return (
    <button type="button" onClick={handleClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${value === true ? "bg-success/20 border-success text-success" : value === false ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border bg-card text-muted-foreground"}`}>
      {value === true ? <Check className="w-3.5 h-3.5" /> : value === false ? <X className="w-3.5 h-3.5" /> : <span className="text-muted-foreground">—</span>}
    </button>
  );
};

// ─── Signature Canvas ──────────────────────────────
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

// ─── Main Flow ──────────────────────────────────────
const Cert3Flow: React.FC<Cert3FlowProps> = ({ job, customer, engineerName, engineerRgi, engineerPhone, onClose }) => {
  const { toast } = useToast();
  const { addToQueue } = useRetryQueue();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [certNumber, setCertNumber] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // Step 1 — Premises
  const [gprn, setGprn] = useState(customer?.gprn || "");
  const [eircode, setEircode] = useState(customer?.eircode || "");
  const [address, setAddress] = useState(customer?.address || "");
  const [custName, setCustName] = useState(customer?.name || "");
  const [telNo, setTelNo] = useState(customer?.phone || "");
  const [gasType, setGasType] = useState("NAT GAS");

  // Step 2 — Appliance table
  const [applianceData, setApplianceData] = useState<Record<string, Record<string, boolean | null>>>(() => {
    const init: Record<string, Record<string, boolean | null>> = {};
    APPLIANCE_ROWS.forEach(row => { init[row] = {}; APPLIANCE_COLS.forEach(col => { init[row][col] = null; }); });
    return init;
  });

  const toggleAppliance = (row: string, col: string) => {
    setApplianceData(prev => {
      const cur = prev[row][col];
      const next = cur === null ? true : cur === true ? false : null;
      return { ...prev, [row]: { ...prev[row], [col]: next } };
    });
  };

  // Step 3 — Readings
  const [coPpm, setCoPpm] = useState("");
  const [co2Pct, setCo2Pct] = useState("");
  const ratio = useMemo(() => {
    const co = parseFloat(coPpm); const co2 = parseFloat(co2Pct);
    if (!isNaN(co) && !isNaN(co2) && co2 > 0) return (co / co2).toFixed(2);
    return "—";
  }, [coPpm, co2Pct]);

  const [flueInspected, setFlueInspected] = useState("NO");
  const [applianceLocation, setApplianceLocation] = useState("NO");
  const [ventilation, setVentilation] = useState("NO");
  const [soundnessTest, setSoundnessTest] = useState("NO");

  // Step 4 — Comments + Next Service + Engineer Details
  const [comments, setComments] = useState("");
  const [nextServiceDue, setNextServiceDue] = useState("");
  const [traineeNo, setTraineeNo] = useState("");
  const [hazardIssued, setHazardIssued] = useState("NO");
  const [hazardNo, setHazardNo] = useState("");
  const [hazardReason, setHazardReason] = useState("");

  const generateCertNum = (prefix: string) => {
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
    const cn = generateCertNum(prefix);
    const today = new Date().toISOString().split("T")[0];

    const certData = {
      organisation_id: job.organisation_id,
      job_id: job.id,
      customer_id: customer.id,
      cert_number: cn,
      checks: {
        flue_inspected: { status: flueInspected === "YES" ? "pass" : "unchecked", note: "" },
        appliance_location: { status: applianceLocation === "YES" ? "pass" : "unchecked", note: "" },
        ventilation: { status: ventilation === "YES" ? "pass" : "unchecked", note: "" },
        soundness_test: { status: soundnessTest === "YES" ? "pass" : "unchecked", note: "" },
      } as any,
      notes: {
        cert_type: "domestic_safety_service",
        gprn, eircode, address, customer_name: custName, tel_no: telNo, gas_type: gasType,
        appliance_table: applianceData,
        comments, next_service_due: nextServiceDue,
        trainee_no: traineeNo, hazard_issued: hazardIssued, hazard_no: hazardNo, hazard_reason: hazardReason,
        date_of_test: today, date_of_issue: today,
      } as any,
      readings: { co_ppm: coPpm, co2_pct: co2Pct, ratio } as any,
      engineer_sig_url: engSigUrl,
    };

    const { data: insertedRow, error } = await supabase.from("certificates" as any).insert(certData as any).select("id").single();

    setSaving(false);
    if (error) {
      console.error("Cert3 insert failed, queuing for retry:", error.message);
      addToQueue({ table: "certificates", operation: "insert", payload: certData });
      toast({ title: "No connection", description: "Certificate saved and will sync automatically when back online", variant: "destructive" });
    } else {
      setCertNumber(cn);
      const newCertId = (insertedRow as any)?.id;
      setCertId(newCertId);
      setStep(5); // success screen

      // Trigger PDF generation
      if (newCertId) {
        supabase.functions.invoke("generate-cert3-pdf", {
          body: { certificate_id: newCertId },
        }).catch((err) => console.error("PDF generation error:", err));

        // Poll for PDF URL
        const poll = setInterval(async () => {
          const { data } = await supabase.from("certificates" as any).select("pdf_url").eq("id", newCertId).single();
          if ((data as any)?.pdf_url) {
            setPdfUrl((data as any).pdf_url);
            clearInterval(poll);
          }
        }, 3000);
        setTimeout(() => clearInterval(poll), 60000);
      }
    }
  };

  // ─── Progress Bar ────────────
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

  const handleSendWhatsApp = async () => {
    if (!certId) return;
    setWhatsappStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("send-certificate-whatsapp", {
        body: { certificate_id: certId },
      });
      if (error || !data?.success) setWhatsappStatus("failed");
      else setWhatsappStatus("sent");
    } catch { setWhatsappStatus("failed"); }
  };

  // ─── Success Screen ────────────
  if (step === 5) {
    return createPortal(
      <div className="fixed inset-0 z-[900] bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ACCENT}20` }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: ACCENT }} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">Certificate Created</h1>
        <p className="text-lg font-bold" style={{ color: ACCENT }}>{certNumber}</p>
        <p className="text-muted-foreground">{custName}</p>
        <p className="text-sm text-muted-foreground">Domestic Safety / Service</p>

        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#22c55e" }}>
            <CheckCircle2 className="w-4 h-4" /> PDF Ready — View
          </a>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…
          </div>
        )}

        {whatsappStatus === "idle" && pdfUrl && (
          <Button onClick={handleSendWhatsApp} className="h-12 px-6 font-bold gap-2" style={{ backgroundColor: "#25D366" }}>
            <MessageSquare className="w-4 h-4" /> Send via WhatsApp
          </Button>
        )}
        {whatsappStatus === "sending" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Sending to customer…</div>
        )}
        {whatsappStatus === "sent" && (
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#22c55e" }}><MessageSquare className="w-4 h-4" /> Sent to customer via WhatsApp</div>
        )}
        {whatsappStatus === "failed" && (
          <div className="flex items-center gap-2 text-sm font-bold text-destructive"><AlertTriangle className="w-4 h-4" /> WhatsApp send failed</div>
        )}

        <Button onClick={onClose} className="mt-4 h-12 px-8 font-bold" style={{ backgroundColor: ACCENT }}>Done</Button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[900] bg-background flex flex-col overflow-hidden">
      <ProgressBar />

      <div className="flex-1 overflow-y-auto">
        {/* Step 1 — Premises Details */}
        {step === 0 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Domestic Safety / Service</h2>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">GPRN</Label><Input value={gprn} onChange={e => setGprn(e.target.value)} placeholder="Enter GPRN" className="h-11" /></div>
              <div className="space-y-1"><Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Eircode</Label><Input value={eircode} onChange={e => setEircode(e.target.value)} className="h-11" /></div>
              <div className="space-y-1"><Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="h-11" /></div>
              <div className="space-y-1"><Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Name</Label><Input value={custName} onChange={e => setCustName(e.target.value)} className="h-11" /></div>
              <div className="space-y-1"><Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tel No</Label><Input value={telNo} onChange={e => setTelNo(e.target.value)} className="h-11" /></div>
              <Toggle label="Gas Type" options={["NAT GAS", "LP GAS"]} value={gasType} onChange={setGasType} />
            </div>
          </div>
        )}

        {/* Step 2 — Appliance Table */}
        {step === 1 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Appliance Table</h2>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-2 font-bold text-muted-foreground sticky left-0 bg-background min-w-[90px]">Appliance</th>
                    {APPLIANCE_COLS.map(col => (
                      <th key={col} className="text-center py-2 px-1 font-bold text-muted-foreground min-w-[52px]">
                        <span className="block leading-tight">{col}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {APPLIANCE_ROWS.map(row => (
                    <tr key={row} className="border-t border-border">
                      <td className="py-2 pr-2 text-xs font-bold text-foreground sticky left-0 bg-background">{row}</td>
                      {APPLIANCE_COLS.map(col => (
                        <td key={col} className="text-center py-2 px-1">
                          <div className="flex justify-center">
                            <YesNoCell value={applianceData[row][col]} onChange={() => toggleAppliance(row, col)} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 3 — Readings */}
        {step === 2 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Readings & Safety Checks</h2>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-2xl p-3 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CO (ppm)</Label>
                <Input inputMode="decimal" value={coPpm} onChange={e => setCoPpm(e.target.value)} className="h-14 text-2xl font-extrabold text-center border-0 bg-transparent p-0" placeholder="0" />
              </div>
              <div className="bg-card border border-border rounded-2xl p-3 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CO₂ (%)</Label>
                <Input inputMode="decimal" value={co2Pct} onChange={e => setCo2Pct(e.target.value)} className="h-14 text-2xl font-extrabold text-center border-0 bg-transparent p-0" placeholder="0" />
              </div>
              <div className="bg-card border border-border rounded-2xl p-3 space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CO/CO₂ Ratio</Label>
                <div className="h-14 text-2xl font-extrabold text-center flex items-center justify-center text-primary">{ratio}</div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Safety Checks</p>
              <Toggle label="Flue Inspected and Adequate" options={["YES", "NO"]} value={flueInspected} onChange={setFlueInspected} />
              <Toggle label="Appliance Location Correct" options={["YES", "NO"]} value={applianceLocation} onChange={setApplianceLocation} />
              <Toggle label="Adequate Permanent Ventilation" options={["YES", "NO"]} value={ventilation} onChange={setVentilation} />
              <Toggle label="Soundness Test Pass" options={["YES", "NO"]} value={soundnessTest} onChange={setSoundnessTest} />
            </div>
          </div>
        )}

        {/* Step 4 — Comments, Next Service, Engineer Details */}
        {step === 3 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Comments & Engineer Details</h2>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Comments</Label>
              <Textarea value={comments} onChange={e => setComments(e.target.value)} className="min-h-[80px]" placeholder="Any additional comments…" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Next Service Due</Label>
              <Input type="date" value={nextServiceDue} onChange={e => setNextServiceDue(e.target.value)} className="h-11" />
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Engineer Details</p>
              {([
                ["RGI Name", engineerName || "—"],
                ["RGI Number", engineerRgi || "—"],
                ["Date of Test", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
                ["Date of Issue", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-bold text-foreground">{val}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trainee No (optional)</Label>
              <Input value={traineeNo} onChange={e => setTraineeNo(e.target.value)} className="h-11" placeholder="N/A" />
            </div>

            <Toggle label="Notice of Hazard Issued" options={["YES", "NO"]} value={hazardIssued} onChange={setHazardIssued} />
            {hazardIssued === "YES" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Hazard No.</Label>
                  <Input value={hazardNo} onChange={e => setHazardNo(e.target.value)} className="h-11" placeholder="e.g. NZ-2026-0001" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reason</Label>
                  <Textarea value={hazardReason} onChange={e => setHazardReason(e.target.value)} className="min-h-[60px]" placeholder="Describe the reason…" />
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 5 — Engineer Signature */}
        {step === 4 && (
          <SignatureCanvas
            title="Engineer Signature"
            subtitle={`${engineerName}${engineerRgi ? ` — RGI: ${engineerRgi}` : ""}`}
            onBack={() => setStep(3)}
            onConfirm={(url) => handleSubmit(url)}
          />
        )}
      </div>

      {/* Bottom nav for steps 0-3 */}
      {step <= 3 && (
        <div className="flex gap-2 px-4 pb-6 pt-3 border-t border-border bg-background">
          <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(step - 1)} className="flex-1 h-12 font-bold gap-1">
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button onClick={() => setStep(step + 1)} className="flex-1 h-12 font-bold gap-1" style={{ backgroundColor: ACCENT }}>
            {step === 3 ? "Sign" : "Next"} <ArrowRight className="w-4 h-4" />
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

export default Cert3Flow;
