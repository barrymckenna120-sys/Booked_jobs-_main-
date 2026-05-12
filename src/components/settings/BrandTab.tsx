import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ──────────────────────────────────────────────────────────────────
interface BrandColors {
  header_banner: string;
  header_text: string;
  secondary_band: string;
  accent: string;
  section_labels: string;
  page_background: string;
  body_text: string;
  border_divider: string;
  table_header: string;
  table_row: string;
  alternating_row: string;
}

interface BrandSettings extends BrandColors {
  font_family: string;
}

// ── Defaults ───────────────────────────────────────────────────────────────
const DEFAULTS: BrandSettings = {
  header_banner: "#1E3A5F",
  header_text: "#FFFFFF",
  secondary_band: "#2C4F7C",
  accent: "#4A86E8",
  section_labels: "#1E3A5F",
  page_background: "#FFFFFF",
  body_text: "#1F2937",
  border_divider: "#E2E8F0",
  table_header: "#EBF2FF",
  table_row: "#FFFFFF",
  alternating_row: "#F8FAFF",
  font_family: "Poppins",
};

// ── Presets ─────────────────────────────────────────────────────────────────
const PRESETS: Record<string, Partial<BrandColors>> = {
  Navy: {
    header_banner: "#1E3A5F", secondary_band: "#2C4F7C", accent: "#4A86E8",
    section_labels: "#1E3A5F", table_header: "#EBF2FF", alternating_row: "#F8FAFF",
  },
  Midnight: {
    header_banner: "#111827", secondary_band: "#1F2937", accent: "#6366F1",
    section_labels: "#111827", table_header: "#EEF2FF", alternating_row: "#F5F3FF",
  },
  Forest: {
    header_banner: "#14532D", secondary_band: "#166534", accent: "#22C55E",
    section_labels: "#14532D", table_header: "#F0FDF4", alternating_row: "#F0FDF4",
  },
  Copper: {
    header_banner: "#7C2D12", secondary_band: "#9A3412", accent: "#EA580C",
    section_labels: "#7C2D12", table_header: "#FFF7ED", alternating_row: "#FFFBF5",
  },
  Purple: {
    header_banner: "#3B0764", secondary_band: "#581C87", accent: "#A855F7",
    section_labels: "#3B0764", table_header: "#FAF5FF", alternating_row: "#FDF4FF",
  },
};

// ── Fonts ───────────────────────────────────────────────────────────────────
const FONTS = [
  { name: "Poppins", style: "Modern & friendly" },
  { name: "Lato", style: "Clean & professional" },
  { name: "Raleway", style: "Elegant & refined" },
  { name: "Nunito", style: "Rounded & approachable" },
  { name: "Merriweather", style: "Traditional & trustworthy" },
  { name: "Playfair Display", style: "Premium & editorial" },
  { name: "DM Sans", style: "Geometric & contemporary" },
  { name: "IBM Plex Sans", style: "Technical & precise" },
  { name: "Josefin Sans", style: "Structured & confident" },
  { name: "Crimson Pro", style: "Classic & distinguished" },
];

// ── Colour field definitions ────────────────────────────────────────────────
const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: "header_banner", label: "Header Banner" },
  { key: "header_text", label: "Header Text" },
  { key: "secondary_band", label: "Secondary Band" },
  { key: "accent", label: "Accent" },
  { key: "section_labels", label: "Section Labels" },
  { key: "page_background", label: "Page Background" },
  { key: "body_text", label: "Body Text" },
  { key: "border_divider", label: "Border / Divider" },
  { key: "table_header", label: "Table Header" },
  { key: "table_row", label: "Table Row" },
  { key: "alternating_row", label: "Alternating Row" },
];

// ── DB helpers ──────────────────────────────────────────────────────────────
function toDbRow(s: BrandSettings) {
  return {
    primary_color: s.header_banner,
    secondary_color: s.secondary_band,
    accent_color: s.accent,
    background_color: s.page_background,
    header_text_color: s.header_text,
    body_text_color: s.body_text,
    section_label_color: s.section_labels,
    border_color: s.border_divider,
    table_header_color: s.table_header,
    table_row_color: s.table_row,
    table_alt_color: s.alternating_row,
    font_family: s.font_family,
  };
}

function fromDbRow(row: any): BrandSettings {
  return {
    header_banner: row.primary_color ?? DEFAULTS.header_banner,
    header_text: row.header_text_color ?? DEFAULTS.header_text,
    secondary_band: row.secondary_color ?? DEFAULTS.secondary_band,
    accent: row.accent_color ?? DEFAULTS.accent,
    section_labels: row.section_label_color ?? DEFAULTS.section_labels,
    page_background: row.background_color ?? DEFAULTS.page_background,
    body_text: row.body_text_color ?? DEFAULTS.body_text,
    border_divider: row.border_color ?? DEFAULTS.border_divider,
    table_header: row.table_header_color ?? DEFAULTS.table_header,
    table_row: row.table_row_color ?? DEFAULTS.table_row,
    alternating_row: row.table_alt_color ?? DEFAULTS.alternating_row,
    font_family: row.font_family ?? DEFAULTS.font_family,
  };
}

// ── Load Google Fonts ───────────────────────────────────────────────────────
function loadGoogleFonts() {
  const families = FONTS.map((f) => f.name.replace(/ /g, "+") + ":wght@400;600;700").join("&family=");
  const id = "brand-google-fonts";
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    document.head.appendChild(link);
  }
}

// ── Component ───────────────────────────────────────────────────────────────
const BrandTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<BrandSettings>({ ...DEFAULTS });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"colours" | "fonts">("colours");
  const [previewTab, setPreviewTab] = useState<"cert" | "hazard" | "quote" | "invoice">("cert");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => { loadGoogleFonts(); }, []);

  // Resolve organisation_id from JWT app_metadata once on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const id = (session?.user?.app_metadata as any)?.organisation_id ?? null;
      setOrgId(id);
    });
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!user || !orgId) return;
    (async () => {
      const { data } = await supabase
        .from("brand_settings")
        .select("*")
        .eq("organisation_id", orgId)
        .maybeSingle();
      if (data) {
        setSettings(fromDbRow(data));
        setExistingId(data.id);
      }
      setLoading(false);
    })();
  }, [user, orgId]);

  const setColor = (key: keyof BrandColors, value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    if (p) setSettings((prev) => ({ ...prev, ...p }));
  };

  const handleSave = async () => {
    if (!user || !orgId) return;
    setSaving(true);
    try {
      const row = { ...toDbRow(settings), organisation_id: orgId, updated_at: new Date().toISOString() };
      if (existingId) {
        const { error } = await supabase.from("brand_settings").update(row).eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("brand_settings").insert(row).select().single();
        if (error) throw error;
        setExistingId(data.id);
      }
      toast({ title: "Brand settings saved" });
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setSettings({ ...DEFAULTS });

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const s = settings;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Brand & Document Styling</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="w-4 h-4 mr-1.5" />Reset</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}Save Changes
          </Button>
        </div>
      </div>

      <div className="flex gap-6" style={{ minHeight: 600 }}>
        {/* ── Left Panel ────────────────────────────── */}
        <div className="w-[320px] shrink-0 border border-border rounded-lg overflow-hidden bg-card">
          <div className="flex border-b border-border">
            {(["colours", "fonts"] as const).map((t) => (
              <button key={t} onClick={() => setLeftTab(t)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${leftTab === t ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "colours" ? "Colours" : "Fonts"}
              </button>
            ))}
          </div>

          <div className="p-4 overflow-y-auto" style={{ maxHeight: 540 }}>
            {leftTab === "colours" ? (
              <div className="space-y-4">
                {/* Presets */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Presets</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.keys(PRESETS).map((name) => (
                      <button key={name} onClick={() => applyPreset(name)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors">
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Colour fields */}
                {COLOR_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="relative w-8 h-8 rounded-md border border-border overflow-hidden cursor-pointer shrink-0">
                      <input type="color" value={s[key]} onChange={(e) => setColor(key, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <span className="block w-full h-full" style={{ backgroundColor: s[key] }} />
                    </label>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground leading-tight">{label}</p>
                      <Input value={s[key]} onChange={(e) => setColor(key, e.target.value)}
                        className="h-7 text-xs font-mono mt-0.5" maxLength={7} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {FONTS.map((f) => {
                  const selected = s.font_family === f.name;
                  return (
                    <button key={f.name} onClick={() => setSettings((prev) => ({ ...prev, font_family: f.name }))}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground/30"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm" style={{ fontFamily: `'${f.name}', sans-serif` }}>{f.name}</span>
                        {selected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{f.style}</p>
                      <p className="text-xs mt-1 text-foreground/70" style={{ fontFamily: `'${f.name}', sans-serif` }}>
                        Aa Bb Cc — The quick brown fox
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel — Live Preview ────────────── */}
        <div className="flex-1 min-w-0 border border-border rounded-lg overflow-hidden bg-muted/30">
          <div className="flex border-b border-border bg-card">
            {([["cert", "Gas Certificate"], ["hazard", "Hazard Notice"], ["quote", "Quote"], ["invoice", "Invoice"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setPreviewTab(k as any)}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors relative ${previewTab === k ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
                {k === "hazard" && <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">NEW</span>}
              </button>
            ))}
          </div>
          <div className="p-6 overflow-y-auto" style={{ maxHeight: 580 }}>
            {previewTab === "cert" && <CertPreview s={s} />}
            {previewTab === "hazard" && <HazardPreview s={s} />}
            {previewTab === "quote" && <QuotePreview s={s} />}
            {previewTab === "invoice" && <InvoicePreview s={s} />}
            <p className="text-xs text-muted-foreground mt-4 italic">Both documents use your logo, primary colour, and company details above.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Preview Components ──────────────────────────────────────────────────────

function DocShell({ s, children, title, badgeText }: { s: BrandSettings; children: React.ReactNode; title: string; badgeText: string }) {
  const font = `'${s.font_family}', sans-serif`;
  return (
    <div style={{ fontFamily: font, backgroundColor: s.page_background, color: s.body_text, border: `1px solid ${s.border_divider}`, borderRadius: 8, overflow: "hidden", fontSize: 12 }}>
      {/* Header */}
      <div style={{ background: s.header_banner, color: s.header_text, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
        <span style={{ background: s.accent, color: "#fff", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{badgeText}</span>
      </div>
      {/* Secondary band */}
      <div style={{ background: s.secondary_band, color: s.header_text, padding: "6px 20px", fontSize: 11, opacity: 0.9 }}>
        Issued: 24 Mar 2026
      </div>
      {/* Body */}
      <div style={{ padding: 20 }}>{children}</div>
      {/* Footer */}
      <div style={{ background: s.header_banner, color: s.header_text, padding: "10px 20px", fontSize: 10, display: "flex", justifyContent: "space-between" }}>
        <span>K & N Gas Services Limited</span>
        <span>RGI: R-1899 · 085 123 4567</span>
      </div>
    </div>
  );
}

function SectionTitle({ s, children }: { s: BrandSettings; children: React.ReactNode }) {
  return <p style={{ color: s.section_labels, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, marginTop: 14 }}>{children}</p>;
}

function InfoGrid({ s, rows }: { s: BrandSettings; rows: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 11 }}>
      {rows.map(([label, val], i) => (
        <div key={i}><span style={{ color: s.body_text, opacity: 0.6 }}>{label}: </span><span style={{ fontWeight: 500 }}>{val}</span></div>
      ))}
    </div>
  );
}

function TablePreview({ s, headers, rows }: { s: BrandSettings; headers: string[]; rows: string[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 }}>
      <thead>
        <tr>{headers.map((h, i) => <th key={i} style={{ background: s.table_header, padding: "6px 8px", textAlign: "left", fontWeight: 600, border: `1px solid ${s.border_divider}` }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} style={{ background: ri % 2 === 0 ? s.table_row : s.alternating_row, padding: "5px 8px", border: `1px solid ${s.border_divider}` }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CertPreview({ s }: { s: BrandSettings }) {
  return (
    <DocShell s={s} title="RGI Gas Safety Certificate" badgeText="CERT-2026-0042">
      <SectionTitle s={s}>Company Details</SectionTitle>
      <InfoGrid s={s} rows={[["Company", "K & N Gas Services"], ["RGI No.", "R-1899"], ["Phone", "085 123 4567"], ["Email", "info@kng.ie"]]} />
      <SectionTitle s={s}>Property Details</SectionTitle>
      <InfoGrid s={s} rows={[["Customer", "John Murphy"], ["Address", "12 Oak Drive, Dublin 15"], ["Eircode", "D15 X2Y3"], ["Boiler", "Vaillant ecoTEC Plus"]]} />
      <SectionTitle s={s}>Safety Checks</SectionTitle>
      <TablePreview s={s} headers={["Check", "Result"]}
        rows={[
          ["Gas tightness test", "✅ PASS"],
          ["Flue flow test", "✅ PASS"],
          ["Ventilation check", "✅ PASS"],
          ["CO readings (ppm)", "✅ 12 ppm"],
          ["Gas pressure (mbar)", "✅ 20 mbar"],
          ["Burner operation", "✅ PASS"],
        ]} />
    </DocShell>
  );
}

function HazardPreview({ s }: { s: BrandSettings }) {
  return (
    <DocShell s={s} title="RGI · Notification of Hazard" badgeText="NZ-2026-0001">
      <SectionTitle s={s}>Company Details</SectionTitle>
      <InfoGrid s={s} rows={[["Company", "K & N Gas Services"], ["RGI No.", "R-1899"], ["Phone", "085 123 4567"], ["Engineer", "Barry McKenna"]]} />
      <SectionTitle s={s}>Property Details</SectionTitle>
      <InfoGrid s={s} rows={[["Customer", "John Murphy"], ["Address", "12 Oak Drive, Dublin 15"], ["Eircode", "D15 X2Y3"], ["Gas Type", "Natural Gas"]]} />
      <SectionTitle s={s}>Hazard Type</SectionTitle>
      <TablePreview s={s} headers={["Code", "Classification", "Description"]}
        rows={[
          ["A", "Non-Conformance", "Gas left on, pending rectification"],
          ["B", "Hazard", "Appliance isolated for safety"],
          ["C", "Hazard", "Gas supply isolated for safety"],
        ]} />
      <SectionTitle s={s}>Appliance Details</SectionTitle>
      <InfoGrid s={s} rows={[["Appliance", "Boiler"], ["Make", "Vaillant"], ["Model", "ecoTEC Plus"], ["Location", "Kitchen"]]} />
    </DocShell>
  );
}

function QuotePreview({ s }: { s: BrandSettings }) {
  return (
    <DocShell s={s} title="Quote" badgeText="Q-2026-0018">
      <SectionTitle s={s}>Customer</SectionTitle>
      <InfoGrid s={s} rows={[["Name", "Sarah O'Brien"], ["Address", "8 Willow Park, D6W"], ["Phone", "087 654 3210"]]} />
      <SectionTitle s={s}>Line Items</SectionTitle>
      <TablePreview s={s} headers={["Description", "Qty", "Unit Price", "Total"]}
        rows={[
          ["Boiler Service", "1", "€120.00", "€120.00"],
          ["Thermostat replacement", "1", "€85.00", "€85.00"],
          ["Labour (additional hour)", "1", "€60.00", "€60.00"],
        ]} />
      <div style={{ textAlign: "right", marginTop: 10, fontWeight: 700, fontSize: 13, color: s.accent }}>Total: €265.00</div>
    </DocShell>
  );
}

function InvoicePreview({ s }: { s: BrandSettings }) {
  return (
    <DocShell s={s} title="Invoice" badgeText="INV-0031">
      <SectionTitle s={s}>Billed To</SectionTitle>
      <InfoGrid s={s} rows={[["Name", "Mark Byrne"], ["Address", "3 Elm Court, K67 R2F1"], ["Phone", "086 111 2233"]]} />
      <SectionTitle s={s}>Services</SectionTitle>
      <TablePreview s={s} headers={["Description", "Qty", "Price", "Total"]}
        rows={[
          ["Emergency callout", "1", "€150.00", "€150.00"],
          ["Gas valve replacement", "1", "€210.00", "€210.00"],
        ]} />
      <div style={{ textAlign: "right", marginTop: 10, fontWeight: 700, fontSize: 13, color: s.accent }}>Total Due: €360.00</div>
    </DocShell>
  );
}

export default BrandTab;
