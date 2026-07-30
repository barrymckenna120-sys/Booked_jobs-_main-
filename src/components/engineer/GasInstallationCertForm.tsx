import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { addToQueue } from "@/hooks/useRetryQueue";
import { backfillCustomerGprn } from "@/lib/backfillCustomerGprn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CalendarIcon, Loader2, Save, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GasInstallationCertFormProps {
  job: any;
  customer: any;
  engineerInfo: { name: string; rgi_number: string | null };
  existingCert?: any;
  onClose: () => void;
  onSaved: () => void;
}

const Toggle = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) => (
  <div className="flex rounded-lg border border-border overflow-hidden">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={cn(
          "flex-1 px-3 py-2 text-xs font-bold transition-colors",
          value === o.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const YesNoToggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <Toggle
    value={value ? "yes" : "no"}
    onChange={(v) => onChange(v === "yes")}
    options={[{ label: "YES", value: "yes" }, { label: "NO", value: "no" }]}
  />
);

const SectionHeader = ({ title }: { title: string }) => (
  <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg mt-4 mb-3">
    <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
  </div>
);

const FieldGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
    {children}
  </div>
);

const DatePickerField = ({ label, date, onChange }: { label: string; date: Date | undefined; onChange: (d: Date | undefined) => void }) => (
  <FieldGroup label={label}>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !date && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd/MM/yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[600]" align="start">
        <Calendar mode="single" selected={date} onSelect={onChange} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  </FieldGroup>
);

const GasInstallationCertForm: React.FC<GasInstallationCertFormProps> = ({
  job, customer, engineerInfo, existingCert, onClose, onSaved,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Part I fields
  const [serialNumber, setSerialNumber] = useState(existingCert?.serial_number || "");
  const [gasType, setGasType] = useState(existingCert?.gas_type || "nat_gas");
  const [installType, setInstallType] = useState(existingCert?.install_type || "new");
  const [gprn, setGprn] = useState(existingCert?.gprn || customer?.gprn || "");
  // Defensive: if customer loads after first render, adopt its GPRN — only while
  // the field is still empty, so it can never clobber a value the engineer typed.
  useEffect(() => {
    if (!gprn && customer?.gprn) setGprn(customer.gprn);
  }, [customer?.gprn]);
  const [premisesEircode, setPremisesEircode] = useState(existingCert?.eircode_premises || customer?.eircode || "");
  const [premisesAddress, setPremisesAddress] = useState(existingCert?.address_premises || customer?.address || "");
  const [premisesName, setPremisesName] = useState(existingCert?.customer_name_premises || customer?.name || "");
  const [premisesTel, setPremisesTel] = useState(existingCert?.tel_premises || customer?.phone || "");
  const [ownerEircode, setOwnerEircode] = useState(existingCert?.owner_eircode || "");
  const [ownerAddress, setOwnerAddress] = useState(existingCert?.owner_address || "");
  const [ownerName, setOwnerName] = useState(existingCert?.owner_name || "");
  const [ownerTel, setOwnerTel] = useState(existingCert?.owner_tel || "");

  // Appliances
  const [centralHeating, setCentralHeating] = useState(existingCert?.central_heating || false);
  const [fireOpen, setFireOpen] = useState(existingCert?.fire_open || false);
  const [fireFlueless, setFireFlueless] = useState(existingCert?.fire_flueless || false);
  const [fireRSeal, setFireRSeal] = useState(existingCert?.fire_r_seal || false);
  const [cooker, setCooker] = useState(existingCert?.cooker || false);
  const [hob, setHob] = useState(existingCert?.hob || false);
  const [otherAppliance, setOtherAppliance] = useState(existingCert?.other_appliance || "");
  const [pipeworkMaterial, setPipeworkMaterial] = useState(existingCert?.pipework_material || "copper");

  // Safety checks
  const [locationCorrect, setLocationCorrect] = useState(existingCert?.appliance_location_correct || false);
  const [ventilation, setVentilation] = useState(existingCert?.adequate_ventilation || false);
  const [flueInspected, setFlueInspected] = useState(existingCert?.flue_inspected || false);
  const [soundnessTest, setSoundnessTest] = useState(existingCert?.soundness_test_pass || false);

  // Part II
  const [coReading, setCoReading] = useState(existingCert?.co_reading || "");
  const [co2Reading, setCo2Reading] = useState(existingCert?.co2_reading || "");
  const [coco2Ratio, setCoco2Ratio] = useState(existingCert?.coco2_ratio || "");
  const [commissioningDate, setCommissioningDate] = useState<Date | undefined>(
    existingCert?.commissioning_date ? new Date(existingCert.commissioning_date) : new Date()
  );
  const [issueDate, setIssueDate] = useState<Date | undefined>(
    existingCert?.issue_date ? new Date(existingCert.issue_date) : new Date()
  );

  const rgiNumber = engineerInfo.rgi_number || "";

  // Fetch engineer ID
  const [engineerId, setEngineerId] = useState<string | null>(existingCert?.engineer_id || null);
  useEffect(() => {
    if (!user || engineerId) return;
    supabase.from("engineers").select("id").eq("auth_user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setEngineerId(data.id); });
  }, [user]);

  const buildPayload = () => ({
    service_call_id: job.id,
    organisation_id: job.organisation_id,
    engineer_id: engineerId!,
    serial_number: serialNumber,
    gas_type: gasType,
    install_type: installType,
    gprn,
    eircode_premises: premisesEircode,
    address_premises: premisesAddress,
    customer_name_premises: premisesName,
    tel_premises: premisesTel,
    owner_eircode: ownerEircode,
    owner_address: ownerAddress,
    owner_name: ownerName,
    owner_tel: ownerTel,
    central_heating: centralHeating,
    fire_open: fireOpen,
    fire_flueless: fireFlueless,
    fire_r_seal: fireRSeal,
    cooker,
    hob,
    other_appliance: otherAppliance || null,
    pipework_material: pipeworkMaterial,
    appliance_location_correct: locationCorrect,
    adequate_ventilation: ventilation,
    flue_inspected: flueInspected,
    soundness_test_pass: soundnessTest,
    co_reading: coReading,
    co2_reading: co2Reading,
    coco2_ratio: coco2Ratio,
    commissioning_date: commissioningDate ? format(commissioningDate, "yyyy-MM-dd") : null,
    issue_date: issueDate ? format(issueDate, "yyyy-MM-dd") : null,
    rgi_number: rgiNumber,
  });

  const handleSave = async (newStatus: "draft" | "complete") => {
    if (!engineerId) {
      toast({ title: "Engineer profile not found", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...buildPayload(), status: newStatus };

      if (existingCert?.id) {
        const { error } = await supabase.from("cert2_certificates").update(payload).eq("id", existingCert.id);
        if (error) {
          addToQueue({
            table: "cert2_certificates",
            operation: "update",
            payload,
            filter: { column: "id", value: existingCert.id },
          });
          toast({
            title: "No connection",
            description: "Certificate saved and will sync automatically when back online",
            variant: "destructive",
          });
          onSaved();
          return;
        }
      } else {
        const { error } = await supabase.from("cert2_certificates").insert(payload as any);
        if (error) {
          addToQueue({
            table: "cert2_certificates",
            operation: "insert",
            payload,
          });
          toast({
            title: "No connection",
            description: "Certificate saved and will sync automatically when back online",
            variant: "destructive",
          });
          onSaved();
          return;
        }
      }

      backfillCustomerGprn(customer?.id, gprn);

      toast({ title: newStatus === "draft" ? "Draft saved" : "Certificate marked complete ✓" });
      onSaved();

    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-4 pt-12 pb-4 sticky top-0 z-10">
        <button onClick={onClose} className="flex items-center gap-1.5 text-primary-foreground/80 text-sm font-semibold mb-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-lg font-extrabold text-primary-foreground">Gas Installation / New Meter</h1>
        <p className="text-xs text-primary-foreground/60 mt-0.5">New gas connection · Declaration of Conformance</p>
      </div>

      <div className="px-4 pb-40 space-y-3">
        {/* PART I */}
        <SectionHeader title="Part I — Installation Details" />

        <FieldGroup label="Serial Number">
          <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Enter serial number" className="h-10" />
        </FieldGroup>

        <FieldGroup label="Gas Type">
          <Toggle value={gasType} onChange={setGasType} options={[{ label: "Nat Gas", value: "nat_gas" }, { label: "LP Gas", value: "lp_gas" }]} />
        </FieldGroup>

        <FieldGroup label="Install Type">
          <Toggle value={installType} onChange={setInstallType} options={[{ label: "New", value: "new" }, { label: "Exist Annex E", value: "exist_annex_e" }]} />
        </FieldGroup>

        <FieldGroup label="GPRN">
          <Input value={gprn} onChange={(e) => setGprn(e.target.value)} placeholder="GPRN" className="h-10" />
        </FieldGroup>

        <SectionHeader title="Premises Details" />

        <FieldGroup label="EIRCODE">
          <Input value={premisesEircode} onChange={(e) => setPremisesEircode(e.target.value)} className="h-10" />
        </FieldGroup>
        <FieldGroup label="Address">
          <Textarea value={premisesAddress} onChange={(e) => setPremisesAddress(e.target.value)} rows={2} />
        </FieldGroup>
        <FieldGroup label="Customer Name">
          <Input value={premisesName} onChange={(e) => setPremisesName(e.target.value)} className="h-10" />
        </FieldGroup>
        <FieldGroup label="Tel">
          <Input value={premisesTel} onChange={(e) => setPremisesTel(e.target.value)} type="tel" className="h-10" />
        </FieldGroup>

        <SectionHeader title="Owner Details" />

        <FieldGroup label="EIRCODE">
          <Input value={ownerEircode} onChange={(e) => setOwnerEircode(e.target.value)} className="h-10" />
        </FieldGroup>
        <FieldGroup label="Address">
          <Textarea value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} rows={2} />
        </FieldGroup>
        <FieldGroup label="Name">
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="h-10" />
        </FieldGroup>
        <FieldGroup label="Tel">
          <Input value={ownerTel} onChange={(e) => setOwnerTel(e.target.value)} type="tel" className="h-10" />
        </FieldGroup>

        <SectionHeader title="Appliances Installed" />

        <div className="space-y-2.5">
          {[
            { label: "Central Heating", checked: centralHeating, set: setCentralHeating },
            { label: "Fire Open", checked: fireOpen, set: setFireOpen },
            { label: "Fire Flueless", checked: fireFlueless, set: setFireFlueless },
            { label: "Fire R.Seal", checked: fireRSeal, set: setFireRSeal },
            { label: "Cooker", checked: cooker, set: setCooker },
            { label: "Hob", checked: hob, set: setHob },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <Checkbox checked={item.checked} onCheckedChange={(c) => item.set(!!c)} />
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
            </div>
          ))}
        </div>

        <FieldGroup label="Other Appliance">
          <Input value={otherAppliance} onChange={(e) => setOtherAppliance(e.target.value)} placeholder="Specify other…" className="h-10" />
        </FieldGroup>

        <FieldGroup label="Pipework Material">
          <Toggle value={pipeworkMaterial} onChange={setPipeworkMaterial} options={[
            { label: "Copper", value: "copper" },
            { label: "CSST", value: "csst" },
            { label: "Other", value: "other" },
          ]} />
        </FieldGroup>

        <SectionHeader title="Safety Checks" />

        <div className="space-y-3">
          {[
            { label: "Appliance Location Correct", value: locationCorrect, set: setLocationCorrect },
            { label: "Adequate Permanent Ventilation", value: ventilation, set: setVentilation },
            { label: "Flue Inspected and Adequate", value: flueInspected, set: setFlueInspected },
            { label: "Soundness Test Pass", value: soundnessTest, set: setSoundnessTest },
          ].map((item) => (
            <div key={item.label} className="bg-card border border-border rounded-lg p-3 space-y-2">
              <span className="text-xs font-bold text-foreground">{item.label}</span>
              <YesNoToggle value={item.value} onChange={item.set} />
            </div>
          ))}
        </div>

        {/* PART II */}
        <SectionHeader title="Part II — Commissioning Declaration" />

        <FieldGroup label="CO Reading (ppm)">
          <Input value={coReading} onChange={(e) => setCoReading(e.target.value)} placeholder="e.g. 12" className="h-10" />
        </FieldGroup>
        <FieldGroup label="CO₂ Reading (%)">
          <Input value={co2Reading} onChange={(e) => setCo2Reading(e.target.value)} placeholder="e.g. 8.5" className="h-10" />
        </FieldGroup>
        <FieldGroup label="CO/CO₂ Ratio">
          <Input value={coco2Ratio} onChange={(e) => setCoco2Ratio(e.target.value)} placeholder="e.g. 0.0014" className="h-10" />
        </FieldGroup>

        <DatePickerField label="Commissioning Date" date={commissioningDate} onChange={setCommissioningDate} />
        <DatePickerField label="Issue Date" date={issueDate} onChange={setIssueDate} />

        <FieldGroup label="RGI Number">
          <Input value={rgiNumber} readOnly className="h-10 bg-muted" />
        </FieldGroup>

        {/* Action buttons */}
        <div className="space-y-2.5 pt-4">
          <Button
            className="w-full h-14 text-base font-extrabold gap-2"
            disabled={saving}
            onClick={() => handleSave("complete")}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Mark Complete
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 font-bold gap-2"
            disabled={saving}
            onClick={() => handleSave("draft")}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GasInstallationCertForm;
