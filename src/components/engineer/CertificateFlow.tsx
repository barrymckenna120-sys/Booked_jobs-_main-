import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRetryQueue } from "@/hooks/useRetryQueue";
import { backfillCustomerGprn } from "@/lib/backfillCustomerGprn";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, CheckCircle2, MessageSquare, AlertTriangle } from "lucide-react";

const STEPS = ["Details", "Checks", "Readings", "Customer", "Engineer"];

const HEADER_BG = "#1e3a5f";
const ACCENT = "#4A86E8";

interface CertificateFlowProps {
  job: any;
  customer: any;
  engineerName: string;
  engineerRgi: string | null;
  onClose: () => void;
}

// ─── Signature Canvas ──────────────────────────────────────────────
const SignatureCanvas = ({
  onConfirm,
  onBack,
  title,
  subtitle,
}: {
  onConfirm: (dataUrl: string) => void;
  onBack: () => void;
  title: string;
  subtitle?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const start = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    drawing.current = true;
    hasDrawn.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement!;
    c.width = parent.clientWidth;
    c.height = parent.clientHeight;

    // Attach native touch listeners with passive:false so preventDefault() works on mobile
    const touchStart = (e: TouchEvent) => start(e as any);
    const touchMove = (e: TouchEvent) => move(e as any);
    const touchEnd = () => end();
    c.addEventListener("touchstart", touchStart, { passive: false });
    c.addEventListener("touchmove", touchMove, { passive: false });
    c.addEventListener("touchend", touchEnd, { passive: false });
    return () => {
      c.removeEventListener("touchstart", touchStart);
      c.removeEventListener("touchmove", touchMove);
      c.removeEventListener("touchend", touchEnd);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex-1 mx-4 mb-2 border-2 border-border rounded-xl bg-white relative overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          /* touch listeners attached natively via useEffect with passive:false */
        />
        <div className="absolute bottom-8 left-6 right-6 border-b border-muted-foreground/30" />
        <span className="absolute bottom-2 left-6 text-[10px] text-muted-foreground">Sign above the line</span>
      </div>
      <div className="flex gap-2 px-4 pb-6 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 font-bold gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button variant="outline" onClick={clear} className="h-12 font-bold gap-1">
          <RotateCcw className="w-4 h-4" /> Clear
        </Button>
        <Button
          onClick={() => {
            if (!hasDrawn.current) return;
            onConfirm(canvasRef.current!.toDataURL("image/png"));
          }}
          className="flex-1 h-12 font-bold gap-1"
          style={{ backgroundColor: ACCENT }}
        >
          <Check className="w-4 h-4" /> Confirm
        </Button>
      </div>
    </div>
  );
};

// ─── Main Flow ──────────────────────────────────────────────────────
const CertificateFlow: React.FC<CertificateFlowProps> = ({ job, customer, engineerName, engineerRgi, onClose }) => {
  const { toast } = useToast();
  const { addToQueue } = useRetryQueue();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [certNumber, setCertNumber] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // Auto-navigate back to job detail 3s after success screen appears
  useEffect(() => {
    if (step !== 5) return;
    const timer = setTimeout(() => {
      onClose();
      navigate('/engineer/today');
    }, 3000);
    return () => clearTimeout(timer);
  }, [step, job.id, onClose, navigate]);

  // Step 1 — Details (pre-filled from customer + job data, fallback to customer record)
  const [details, setDetails] = useState({
    customerName: customer?.name || "",
    customerMobile: customer?.phone || "",
    customerAddress: customer?.address || "",
    eircode: customer?.eircode || "",
    gprn: customer?.gprn || "",
    applianceType: job?.boiler_type || customer?.boiler_type || "",
    boilerBrand: job?.boiler_brand || customer?.boiler_brand || "",
    boilerModel: customer?.boiler_model || customer?.boiler_make_model || "",
    flueType: "",
    pipework: "",
    engineerName: engineerName || "",
    date: new Date().toISOString().split("T")[0],
  });

  // Step 2 — Checks
  type CheckResult = { status: "pass" | "fail" | null; note: string };
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    appliance_location: { status: null, note: "" },
    ventilation: { status: null, note: "" },
    flue_inspection: { status: null, note: "" },
    soundness_test: { status: null, note: "" },
  });

  const checkLabels: Record<string, string> = {
    appliance_location: "Appliance Location",
    ventilation: "Ventilation",
    flue_inspection: "Flue Inspection",
    soundness_test: "Soundness Test",
  };

  const allChecksValid = Object.values(checks).every(
    (c) => c.status !== null && (c.status === "pass" || c.note.trim().length > 0)
  );

  // Step 3 — Readings
  const [readings, setReadings] = useState({
    co_ppm: "",
    co2_pct: "",
    ratio: "",
    combustion_co: "",
    combustion_ratio: "",
    inlet_pressure: "",
    working_pressure: "",
    work_carried_out: job?.notes || "",
  });

  const readingLabels: [string, string][] = [
    ["co_ppm", "CO (ppm)"],
    ["co2_pct", "CO₂ (%)"],
    ["ratio", "Ratio"],
    ["combustion_co", "Combustion CO (ppm)"],
    ["combustion_ratio", "Combustion Ratio"],
    ["inlet_pressure", "Inlet Pressure (mbar)"],
    ["working_pressure", "Working Pressure (mbar)"],
  ];

  // Signatures
  const [customerSig, setCustomerSig] = useState<string | null>(null);
  const [engineerSig, setEngineerSig] = useState<string | null>(null);

  const generateCertNumber = (prefix: string) => {
    const year = new Date().getFullYear();
    const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
    return `${prefix}-${year}-${rand}`;
  };

  const handleSubmit = async (engSigUrl: string) => {
    setSaving(true);

    // Resolve tenant-specific cert prefix from settings
    const { data: settingsRow } = await supabase
      .from("settings")
      .select("cert_prefix")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();
    const prefix = ((settingsRow as any)?.cert_prefix || "").trim() || "CERT";
    const cn = generateCertNumber(prefix);


    const { data: insertedRow, error } = await supabase.from("certificates" as any).insert({
      organisation_id: job.organisation_id,
      job_id: job.id,
      customer_id: customer.id,
      cert_number: cn,
      checks: checks as any,
      notes: { details, work_carried_out: readings.work_carried_out } as any,
      readings: {
        co_ppm: readings.co_ppm,
        co2_pct: readings.co2_pct,
        ratio: readings.ratio,
        combustion_co: readings.combustion_co,
        combustion_ratio: readings.combustion_ratio,
        inlet_pressure: readings.inlet_pressure,
        working_pressure: readings.working_pressure,
      } as any,
      customer_sig_url: customerSig,
      engineer_sig_url: engSigUrl,
    } as any).select("id").single();

    setSaving(false);
    if (error) {
      console.error("Certificate insert failed, queuing for retry:", error.message);
      addToQueue({ table: "certificates", operation: "insert", payload: {
        organisation_id: job.organisation_id,
        job_id: job.id,
        customer_id: customer.id,
        cert_number: cn,
        checks,
        notes: { details, work_carried_out: readings.work_carried_out },
        readings: { co_ppm: readings.co_ppm, co2_pct: readings.co2_pct, ratio: readings.ratio, combustion_co: readings.combustion_co, combustion_ratio: readings.combustion_ratio, inlet_pressure: readings.inlet_pressure, working_pressure: readings.working_pressure },
        customer_sig_url: customerSig,
        engineer_sig_url: engSigUrl,
      }});
      toast({ title: "No connection", description: "Certificate saved and will sync automatically when back online", variant: "destructive" });
    } else {
      setCertNumber(cn);
      const newCertId = (insertedRow as any)?.id;
      setCertId(newCertId);
      setStep(5);

      // Write GPRN back to the customer record if they don't have one yet.
      // Awaited so the value is on the row before the PDF is rendered.
      await backfillCustomerGprn(customer?.id, details.gprn);

      // Trigger PDF generation
      if (newCertId) {
        supabase.functions.invoke("generate-certificate-pdf", {
          body: { certificate_id: newCertId },
        }).catch((err) => console.error("PDF generation error:", err));

        // Poll for pdf_url, then send WhatsApp
        const poll = setInterval(async () => {
          const { data } = await supabase
            .from("certificates" as any)
            .select("pdf_url")
            .eq("id", newCertId)
            .single();
          if ((data as any)?.pdf_url) {
            const url = (data as any).pdf_url;
            setPdfUrl(url);
            clearInterval(poll);

            // Auto-send certificate via WhatsApp
            setWhatsappStatus("sending");
            try {
              const { data: waData, error: waError } = await supabase.functions.invoke("send-certificate-whatsapp", {
                body: { certificate_id: newCertId },
              });
              if (waError || !waData?.success) {
                setWhatsappStatus("failed");
              } else {
                setWhatsappStatus("sent");
              }
            } catch {
              setWhatsappStatus("failed");
            }
          }
        }, 3000);

        // Stop polling after 60s
        setTimeout(() => clearInterval(poll), 60000);
      }
    }
  };

  // ─── Progress Bar ────────────
  const ProgressBar = () => (
    <div className="flex items-center px-4 py-3 gap-1" style={{ backgroundColor: HEADER_BG }}>
      {STEPS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="h-1 w-full rounded-full transition-colors"
            style={{ backgroundColor: i <= step ? ACCENT : "rgba(255,255,255,0.2)" }}
          />
          <span
            className="text-[9px] font-bold tracking-wider"
            style={{ color: i <= step ? "#fff" : "rgba(255,255,255,0.4)" }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );

  // ─── Success Screen ────────────
  if (step === 5) {
    return createPortal(
      <div className="fixed inset-0 z-[900] bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ACCENT}20` }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: ACCENT }} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">Certificate Created</h1>
        <p className="text-lg font-bold" style={{ color: ACCENT }}>{certNumber}</p>
        <p className="text-muted-foreground">{customer.name}</p>

        {/* PDF Status */}
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: "#22c55e" }}
          >
            <CheckCircle2 className="w-4 h-4" /> PDF Ready — View
          </a>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> ⏳ Generating PDF…
          </div>
        )}

        {/* WhatsApp Status */}
        {whatsappStatus === "sending" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Sending to customer…
          </div>
        )}
        {whatsappStatus === "sent" && (
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#22c55e" }}>
            <MessageSquare className="w-4 h-4" /> 📱 Sent to customer via WhatsApp
          </div>
        )}
        {whatsappStatus === "failed" && (
          <div className="flex items-center gap-2 text-sm font-bold text-destructive">
            <AlertTriangle className="w-4 h-4" /> WhatsApp send failed — check Message Log
          </div>
        )}

        <Button onClick={() => { onClose(); navigate(-1); }} className="mt-4 h-12 px-8 font-bold" style={{ backgroundColor: ACCENT }}>
          Back to Job
        </Button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[900] bg-background flex flex-col overflow-hidden">
      <ProgressBar />

      <div className="flex-1 overflow-y-auto">
        {/* Step 1 — Details */}
        {step === 0 && (
          <div className="px-4 py-4 space-y-3">
            <h2 className="text-lg font-extrabold text-foreground">Appliance Details</h2>
            {([
              ["customerName", "Customer Name"],
              ["customerMobile", "Customer Mobile"],
              ["customerAddress", "Address"],
              ["eircode", "Eircode"],
              ["applianceType", "Appliance Type"],
              ["boilerBrand", "Boiler Brand"],
              ["boilerModel", "Boiler Make / Model"],
              ["flueType", "Flue Type"],
              ["pipework", "Pipework"],
              ["engineerName", "Engineer Name"],
              ["date", "Date of Inspection"],
            ] as [keyof typeof details, string][]).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
                <Input
                  type={key === "date" ? "date" : "text"}
                  value={details[key]}
                  onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))}
                  className="h-11"
                />
              </div>
            ))}
          </div>
        )}

        {/* Step 2 — Checks */}
        {step === 1 && (
          <div className="px-4 py-4 space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">Safety Checks</h2>
            {Object.entries(checkLabels).map(([key, label]) => {
              const c = checks[key];
              return (
                <div key={key} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-extrabold text-foreground">{label}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setChecks((prev) => ({ ...prev, [key]: { ...prev[key], status: "pass" } }))}
                      className={`flex-1 h-14 rounded-xl text-sm font-extrabold border-2 transition-colors ${
                        c.status === "pass"
                          ? "border-green-500 bg-green-500/10 text-green-700"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      ✓ Pass
                    </button>
                    <button
                      onClick={() => setChecks((prev) => ({ ...prev, [key]: { ...prev[key], status: "fail" } }))}
                      className={`flex-1 h-14 rounded-xl text-sm font-extrabold border-2 transition-colors ${
                        c.status === "fail"
                          ? "border-red-500 bg-red-500/10 text-red-700"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      ✕ Fail
                    </button>
                  </div>
                  {c.status === "fail" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-destructive">Note required — describe the issue</Label>
                      <Textarea
                        value={c.note}
                        onChange={(e) =>
                          setChecks((prev) => ({ ...prev, [key]: { ...prev[key], note: e.target.value } }))
                        }
                        className="min-h-[60px]"
                        placeholder="Describe the issue…"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step 3 — Readings */}
        {step === 2 && (
          <div className="px-4 py-4 space-y-3">
            <h2 className="text-lg font-extrabold text-foreground">Readings</h2>
            <div className="grid grid-cols-2 gap-3">
              {readingLabels.map(([key, label]) => (
                <div key={key} className="bg-card border border-border rounded-2xl p-3 space-y-1">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
                  <Input
                    inputMode="decimal"
                    value={(readings as any)[key]}
                    onChange={(e) => setReadings((r) => ({ ...r, [key]: e.target.value }))}
                    className="h-14 text-2xl font-extrabold text-center border-0 bg-transparent p-0"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1 pt-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Work Carried Out</Label>
              <Textarea
                value={readings.work_carried_out}
                onChange={(e) => setReadings((r) => ({ ...r, work_carried_out: e.target.value }))}
                className="min-h-[100px]"
                placeholder="Describe work carried out…"
              />
            </div>
          </div>
        )}

        {/* Step 4 — Customer Signature */}
        {step === 3 && (
          <SignatureCanvas
            title="Customer Signature"
            subtitle="Hand phone to customer"
            onBack={() => setStep(2)}
            onConfirm={(url) => {
              setCustomerSig(url);
              setStep(4);
            }}
          />
        )}

        {/* Step 5 — Engineer Signature */}
        {step === 4 && (
          <SignatureCanvas
            title="Engineer Signature"
            subtitle={`${engineerName}${engineerRgi ? ` — RGI: ${engineerRgi}` : ""}`}
            onBack={() => setStep(3)}
            onConfirm={(url) => {
              setEngineerSig(url);
              handleSubmit(url);
            }}
          />
        )}
      </div>

      {/* Bottom nav for steps 0-2 */}
      {step <= 2 && (
        <div className="flex gap-2 px-4 pb-6 pt-3 border-t border-border bg-background">
          <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(step - 1)} className="flex-1 h-12 font-bold gap-1">
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !allChecksValid}
            className="flex-1 h-12 font-bold gap-1"
            style={{ backgroundColor: ACCENT }}
          >
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

export default CertificateFlow;
