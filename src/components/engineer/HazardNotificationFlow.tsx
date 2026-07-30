import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { backfillCustomerGprn } from "@/lib/backfillCustomerGprn";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Loader2, RotateCcw, CheckCircle2, MessageSquare, AlertTriangle, X } from "lucide-react";

const HEADER_BG = "#1e3a5f";
const ACCENT = "#4A86E8";
const RED_HEADER = "#8B1A1A";

interface HazardNotificationFlowProps {
  job: any;
  customer: any;
  engineerName: string;
  engineerRgi: string | null;
  onClose: () => void;
}

// ─── Signature Canvas (reusing same pattern) ────────────────────
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
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
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
          onClick={() => { if (!hasDrawn.current) return; onConfirm(canvasRef.current!.toDataURL("image/png")); }}
          className="flex-1 h-12 font-bold gap-1"
          style={{ backgroundColor: ACCENT }}
        >
          <Check className="w-4 h-4" /> Confirm
        </Button>
      </div>
    </div>
  );
};

// ─── Section header bar ─────────────────────────────────────────
const SectionBar = ({ title, bg = HEADER_BG }: { title: string; bg?: string }) => (
  <div className="rounded-lg px-3 py-2 mb-2" style={{ backgroundColor: bg }}>
    <span className="text-[11px] font-bold text-white uppercase tracking-wider">{title}</span>
  </div>
);

// ─── Read-only field (gas cert style) ───────────────────────────
const ReadOnlyField = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-[#f0f4f8] rounded-lg px-3 py-2.5">
    <div className="text-[10px] font-bold text-[#888] uppercase tracking-wider mb-0.5">{label}</div>
    <div className="text-[13px] font-bold text-[#1e3a5f]">{value || "—"}</div>
  </div>
);

// ─── Editable field ─────────────────────────────────────────────
const EditField = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="bg-[#f0f4f8] rounded-lg px-3 py-2.5">
    <Label className="text-[10px] font-bold text-[#888] uppercase tracking-wider">{label}</Label>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 mt-1 border-[#d1d5db] text-[13px] font-bold text-[#1e3a5f]"
    />
  </div>
);

// ─── Hazard type checkboxes ─────────────────────────────────────
const HAZARD_TYPES = [
  { code: "A", title: "Non-Conformance", desc: "Gas left on, pending rectification", color: "#DC2626" },
  { code: "B", title: "Hazard", desc: "Appliance isolated for safety", color: "#DC2626" },
  { code: "C", title: "Hazard", desc: "Gas supply isolated for safety", color: "#DC2626" },
];

const generateRefNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9999) + 1;
  return `NZ-${year}-${String(rand).padStart(4, "0")}`;
};

// ─── Main Flow ──────────────────────────────────────────────────
const HazardNotificationFlow: React.FC<HazardNotificationFlowProps> = ({ job, customer, engineerName, engineerRgi: engineerRgiProp, onClose }) => {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"form" | "customer_sig" | "engineer_sig" | "success">("form");
  const [saving, setSaving] = useState(false);
  const [refNumber] = useState(generateRefNumber);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hazardId, setHazardId] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // Live RGI lookup — always use the latest value from the engineers table
  const [engineerRgi, setEngineerRgi] = useState<string | null>(engineerRgiProp);

  useEffect(() => {
    const fetchLiveRgi = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("engineers")
        .select("rgi_number")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if ((data as any)?.rgi_number) {
        setEngineerRgi((data as any).rgi_number);
      }
    };
    fetchLiveRgi();
  }, []);

  // Form state
  const [gasType, setGasType] = useState<"natural_gas" | "lpg">("natural_gas");
  const [gasSupplier, setGasSupplier] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [appliance, setAppliance] = useState(() => {
    const jt = job?.job_type || "";
    const boilerTypes = ["Service", "Repair", "Emergency", "Boiler Service", "Boiler Repair", "boiler_service", "boiler_repair"];
    if (boilerTypes.some(t => jt.toLowerCase().includes(t.toLowerCase()))) return "Boiler";
    return jt || "";
  });
  const [make, setMake] = useState(job?.boiler_brand || customer?.boiler_brand || "");
  const [model, setModel] = useState(customer?.boiler_model || customer?.boiler_make_model || "");
  const [location, setLocation] = useState("");
  const [gprn, setGprn] = useState(customer?.gprn || "");
  // customer is normally loaded before this flow mounts, but if it arrives late,
  // adopt its GPRN — only while the field is still empty, so it can never
  // clobber a value the engineer has typed.
  useEffect(() => {
    if (!gprn && customer?.gprn) setGprn(customer.gprn);
  }, [customer?.gprn]);
  const [isolationReasons, setIsolationReasons] = useState("");
  const [pressureReading, setPressureReading] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [isolationNotes, setIsolationNotes] = useState("");
  const [gasIsolated, setGasIsolated] = useState<boolean | null>(null);
  const [applianceNotes, setApplianceNotes] = useState("");

  // Signatures
  const [customerSig, setCustomerSig] = useState<string | null>(null);

  const toggleType = (code: string) => {
    setSelectedTypes((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  };

  const showIsolation = selectedTypes.includes("C");
  const todayFormatted = new Date().toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });

  const handleSubmit = async (engSigUrl: string) => {
    setSaving(true);

    const { data: insertedRow, error } = await supabase.from("hazard_notifications" as any).insert({
      organisation_id: job.organisation_id,
      job_id: job.id,
      customer_id: customer.id,
      ref_number: refNumber,
      hazard_types: selectedTypes as any,
      gas_type: gasType,
      gas_supplier: gasSupplier || null,
      appliance,
      make,
      model,
      location,
      isolation_reasons: isolationReasons || null,
      pressure_reading: pressureReading || null,
      meter_number: meterNumber || null,
      meter_reading: meterReading || null,
      isolation_notes: isolationNotes || null,
      gas_isolated_to_premises: gasIsolated,
      appliance_notes: applianceNotes || null,
      customer_sig_url: customerSig,
      engineer_sig_url: engSigUrl,
    } as any).select("id").single();

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
      return;
    }

    const newId = (insertedRow as any)?.id;
    await backfillCustomerGprn(customer?.id, gprn);
    setHazardId(newId);
    setPhase("success");

    // Trigger PDF generation
    if (newId) {
      supabase.functions.invoke("generate-hazard-pdf", {
        body: { hazard_id: newId },
      }).catch((err) => console.error("Hazard PDF generation error:", err));

      // Poll for pdf_url
      const poll = setInterval(async () => {
        const { data } = await supabase
          .from("hazard_notifications" as any)
          .select("pdf_url")
          .eq("id", newId)
          .single();
        if ((data as any)?.pdf_url) {
          setPdfUrl((data as any).pdf_url);
          clearInterval(poll);
        }
      }, 3000);
      setTimeout(() => clearInterval(poll), 60000);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!hazardId) return;
    setWhatsappStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("send-hazard-whatsapp", {
        body: { hazard_id: hazardId },
      });
      if (error || !data?.success) {
        setWhatsappStatus("failed");
      } else {
        setWhatsappStatus("sent");
      }
    } catch {
      setWhatsappStatus("failed");
    }
  };

  // ─── Success Screen ────────────
  if (phase === "success") {
    return createPortal(
      <div className="fixed inset-0 z-[900] bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ACCENT}20` }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: ACCENT }} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">Hazard Notification Created</h1>
        <p className="text-lg font-bold" style={{ color: ACCENT }}>{refNumber}</p>
        <p className="text-muted-foreground">{customer.name}</p>

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

        {/* Send WhatsApp button */}
        {pdfUrl && whatsappStatus === "idle" && (
          <Button onClick={handleSendWhatsApp} className="h-12 px-6 font-bold gap-2 text-white" style={{ backgroundColor: "#25D366" }}>
            <MessageSquare className="w-4 h-4" /> Send via WhatsApp
          </Button>
        )}
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

        <Button onClick={onClose} className="mt-4 h-12 px-8 font-bold" style={{ backgroundColor: ACCENT }}>
          Back to Job
        </Button>
      </div>,
      document.body
    );
  }

  // ─── Customer Signature ────────────
  if (phase === "customer_sig") {
    return createPortal(
      <div className="fixed inset-0 z-[900] bg-background flex flex-col">
        <SignatureCanvas
          title="Customer Signature"
          subtitle={customer.name}
          onBack={() => setPhase("form")}
          onConfirm={(url) => { setCustomerSig(url); setPhase("engineer_sig"); }}
        />
      </div>,
      document.body
    );
  }

  // ─── Engineer Signature ────────────
  if (phase === "engineer_sig") {
    return createPortal(
      <div className="fixed inset-0 z-[900] bg-background flex flex-col">
        {saving ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SignatureCanvas
            title="Engineer Signature"
            subtitle={`${engineerName} — RGI: ${engineerRgi || "N/A"}`}
            onBack={() => setPhase("customer_sig")}
            onConfirm={handleSubmit}
          />
        )}
      </div>,
      document.body
    );
  }

  // ─── Form ────────────
  return createPortal(
    <div className="fixed inset-0 z-[900] bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: HEADER_BG }}>
        <button onClick={onClose} className="text-white"><X className="w-5 h-5" /></button>
        <span className="text-white text-sm font-bold">Notification of Hazard</span>
        <div className="w-5" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* HEADER CARD */}
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="px-4 py-3 flex justify-between items-start" style={{ backgroundColor: HEADER_BG }}>
            <div>
              <div className="text-white text-[15px] font-extrabold">RGI · Notification of Hazard</div>
              <div className="text-white/70 text-[11px] font-medium">Safe Energy Ireland</div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-bold" style={{ color: ACCENT }}>{refNumber}</div>
              <div className="text-white/60 text-[11px]">Issued: {todayFormatted}</div>
            </div>
          </div>
        </div>

        {/* COMPANY DETAILS */}
        <SectionBar title="Company Details" />
        <div className="grid grid-cols-2 gap-2">
          <ReadOnlyField label="Company" value={job?.business_name || "K & N Gas Services"} />
          <ReadOnlyField label="Phone" value={customer?.phone || ""} />
          <div className="col-span-2"><ReadOnlyField label="Address" value={customer?.address || ""} /></div>
          <ReadOnlyField label="Engineer" value={engineerName} />
          <ReadOnlyField label="RGI Number" value={engineerRgi || ""} />
        </div>

        {/* PROPERTY DETAILS */}
        <SectionBar title="Property Details" />
        <div className="grid grid-cols-2 gap-2">
          <ReadOnlyField label="Customer" value={customer?.name || ""} />
          <ReadOnlyField label="Contact" value={customer?.phone || ""} />
          <div className="col-span-2"><ReadOnlyField label="Address" value={customer?.address || ""} /></div>
          <ReadOnlyField label="Eircode" value={customer?.eircode || ""} />
          <EditField label="GPRN" value={gprn} onChange={setGprn} placeholder="e.g. 3445AB12" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Gas Type</Label>
          <div className="flex gap-2">
            {(["natural_gas", "lpg"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setGasType(type)}
                className={`flex-1 h-11 rounded-xl text-sm font-bold border-2 transition-colors ${
                  gasType === type ? "border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f]" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {type === "natural_gas" ? "Natural Gas" : "LPG"}
              </button>
            ))}
          </div>
          <EditField label="Gas Supplier" value={gasSupplier} onChange={setGasSupplier} placeholder="e.g. Bord Gáis, Flogas" />
        </div>

        {/* HAZARD TYPE */}
        <SectionBar title="Hazard Type" />
        <div className="space-y-2">
          {HAZARD_TYPES.map((ht) => (
            <button
              key={ht.code}
              onClick={() => toggleType(ht.code)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                selectedTypes.includes(ht.code) ? "border-red-500 bg-red-50" : "border-border bg-card"
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-extrabold shrink-0 ${
                selectedTypes.includes(ht.code) ? "bg-red-600" : "bg-red-400/60"
              }`}>
                {ht.code}
              </div>
              <div>
                <div className="text-[13px] font-extrabold text-foreground">{ht.code} — {ht.title}</div>
                <div className="text-[11px] text-muted-foreground">{ht.desc}</div>
              </div>
              <div className="ml-auto">
                {selectedTypes.includes(ht.code) ? (
                  <Check className="w-5 h-5 text-red-600" />
                ) : (
                  <div className="w-5 h-5 rounded border-2 border-border" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* APPLIANCE DETAILS */}
        <SectionBar title="Appliance Details" />
        <div className="grid grid-cols-2 gap-2">
          <EditField label="Appliance" value={appliance} onChange={setAppliance} placeholder="e.g. Boiler" />
          <EditField label="Make" value={make} onChange={setMake} placeholder="e.g. Vaillant" />
          <EditField label="Model" value={model} onChange={setModel} placeholder="e.g. ecoTEC Plus" />
          <EditField label="Location" value={location} onChange={setLocation} placeholder="e.g. Kitchen" />
        </div>
        <div className="bg-[#f0f4f8] rounded-lg px-3 py-2.5">
          <Label className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Appliance Notes</Label>
          <Textarea
            value={applianceNotes}
            onChange={(e) => setApplianceNotes(e.target.value)}
            placeholder="Age, condition, visible damage, non-standard setup…"
            className="min-h-[60px] mt-1 border-[#d1d5db] text-[13px]"
          />
        </div>

        {/* ISOLATION DETAILS — only when C is selected */}
        {showIsolation && (
          <>
            <SectionBar title="Isolation Details" bg={RED_HEADER} />
            <div className="space-y-2">
              <div className="bg-[#f0f4f8] rounded-lg px-3 py-2.5">
                <Label className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Reasons for Isolation</Label>
                <Textarea
                  value={isolationReasons}
                  onChange={(e) => setIsolationReasons(e.target.value)}
                  placeholder="Describe reasons for isolation…"
                  className="min-h-[60px] mt-1 border-[#d1d5db] text-[13px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <EditField label="Pressure Test / Gas Leakage Reading" value={pressureReading} onChange={setPressureReading} />
                <EditField label="Meter Number" value={meterNumber} onChange={setMeterNumber} />
                <EditField label="Meter Reading" value={meterReading} onChange={setMeterReading} />
              </div>
              <div className="bg-[#f0f4f8] rounded-lg px-3 py-2.5">
                <Label className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Other Notes</Label>
                <Textarea
                  value={isolationNotes}
                  onChange={(e) => setIsolationNotes(e.target.value)}
                  placeholder="Additional notes…"
                  className="min-h-[50px] mt-1 border-[#d1d5db] text-[13px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Gas Isolated to Premises</Label>
                <div className="flex gap-2">
                  {([true, false] as const).map((val) => (
                    <button
                      key={String(val)}
                      onClick={() => setGasIsolated(val)}
                      className={`flex-1 h-11 rounded-xl text-sm font-bold border-2 transition-colors ${
                        gasIsolated === val ? "border-[#8B1A1A] bg-[#8B1A1A]/10 text-[#8B1A1A]" : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {val ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* DECLARATION */}
        <div className="bg-[#EBF2FF] border border-[#d1d5db] rounded-xl p-4 text-[11px] text-[#444] leading-relaxed">
          <strong>Declaration:</strong> This notification is issued in the interest of safety of this premise and the persons therein. The gas supply/appliance shall only be restored by a Registered Gas Installer (RGI) in accordance with I.S.813, I.S.820 or I.S. EN 1949.
        </div>

        {/* FOOTER BAR */}
        <div className="rounded-lg px-4 py-2.5 text-[10px] text-white" style={{ backgroundColor: HEADER_BG }}>
          {engineerName} · RGI: {engineerRgi || "N/A"} · {customer?.phone || ""}
        </div>
      </div>

      {/* Bottom action buttons */}
      <div className="border-t border-border p-4 space-y-2 bg-card">
        <Button
          className="w-full h-14 text-base font-extrabold gap-2 text-white"
          style={{ backgroundColor: ACCENT }}
          disabled={selectedTypes.length === 0}
          onClick={() => setPhase("customer_sig")}
        >
          Continue to Signatures
        </Button>
        <Button variant="outline" className="w-full h-12 font-bold" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>,
    document.body
  );
};

export default HazardNotificationFlow;
