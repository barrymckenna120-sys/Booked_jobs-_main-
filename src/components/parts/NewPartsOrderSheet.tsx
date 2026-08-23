import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BellOff, Loader2, Search, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { insertPartsRequest, type PartPriority } from "@/lib/partsRequests";

const PRIORITIES: { value: PartPriority; label: string; emoji: string; border: string; text: string; selected: string }[] = [
  { value: "urgent", label: "Urgent", emoji: "🔴", border: "border-[#DC2626]", text: "text-[#DC2626]", selected: "bg-[#DC2626] text-white border-[#DC2626]" },
  { value: "normal", label: "Normal", emoji: "🟡", border: "border-[#D97706]", text: "text-[#D97706]", selected: "bg-[#D97706] text-white border-[#D97706]" },
  { value: "low",    label: "Low",    emoji: "🟢", border: "border-[#16A34A]", text: "text-[#16A34A]", selected: "bg-[#16A34A] text-white border-[#16A34A]" },
];

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
}

interface JobRow {
  id: string;
  job_reference: string | null;
  job_type: string | null;
  scheduled_date: string | null;
  status: string | null;
}

interface EngineerRow {
  id: string;
  name: string | null;
  auth_user_id: string | null;
  role: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  organisationId: string | null;
  /** Called after a successful insert so the parts list can refetch. */
  onCreated: () => void;
}

/**
 * Office-side "New Order": logs a phoned-in part order straight into
 * parts_requests. A job link is optional — orders taken over the phone often
 * arrive before the job exists, so the customer can be picked from the book or
 * typed in free-hand.
 */
const NewPartsOrderSheet = ({ open, onClose, organisationId, onCreated }: Props) => {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualAddress, setManualAddress] = useState("");

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobId, setJobId] = useState<string>("");

  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [engineerId, setEngineerId] = useState<string>("");

  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [priority, setPriority] = useState<PartPriority>("normal");
  // BJ-0071 / BJ-0072 — supplier cost, ETA and quote reference. Tracking only:
  // never feeds revenue, quotes or the customer's price.
  const [quotedCost, setQuotedCost] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [quoteReference, setQuoteReference] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSearch("");
    setResults([]);
    setCustomer(null);
    setManual(false);
    setManualName("");
    setManualPhone("");
    setManualAddress("");
    setJobs([]);
    setJobId("");
    setEngineerId("");
    setDescription("");
    setQuantity("1");
    setPriority("normal");
    setQuotedCost("");
    setExpectedDelivery("");
    setQuoteReference("");
  };

  const close = () => {
    reset();
    onClose();
  };

  // Field engineers only for the assignment picker — owner/office/admin rows are
  // team members but never the person who fits the part.
  useEffect(() => {
    if (!open || !organisationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("engineers")
        .select("id, name, auth_user_id, role")
        .eq("organisation_id", organisationId)
        .eq("status", "active")
        .in("role", ["engineer"])
        .order("name");
      if (!cancelled) setEngineers(((data as any[]) || []) as EngineerRow[]);
    })();
    return () => { cancelled = true; };
  }, [open, organisationId]);

  // Debounced customer search.
  useEffect(() => {
    if (!open || !organisationId) return;
    const term = search.trim();
    if (customer || manual || term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, address")
        .eq("organisation_id", organisationId)
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(8);
      if (!cancelled) {
        setResults(((data as any[]) || []) as CustomerRow[]);
        setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, open, organisationId, customer, manual]);

  // Recent jobs for the chosen customer — optional link.
  useEffect(() => {
    if (!customer) {
      setJobs([]);
      setJobId("");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, job_reference, job_type, scheduled_date, status")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) setJobs(((data as any[]) || []) as JobRow[]);
    })();
    return () => { cancelled = true; };
  }, [customer]);

  const selectedEngineer = useMemo(
    () => engineers.find((e) => e.id === engineerId) || null,
    [engineers, engineerId],
  );

  const hasCustomer = !!customer || (manual && manualName.trim().length > 0);
  const canSave = !!organisationId && hasCustomer && description.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave || !organisationId) return;
    setSaving(true);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;
    let officeName: string | null = null;
    if (userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      officeName = (prof as any)?.display_name ?? null;
    }

    const parsedQty = parseInt(quantity, 10);
    const { error } = await insertPartsRequest({
      part: {
        description: description.trim(),
        priority,
        quantity: Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1,
      },
      organisationId,
      serviceCallId: jobId || null,
      customerId: customer?.id ?? null,
      customerName: customer ? null : manualName.trim(),
      customerPhone: customer ? null : manualPhone.trim() || null,
      customerAddress: customer ? null : manualAddress.trim() || null,
      loggedBy: userId,
      loggedByName: officeName || "Office",
      assignedTo: engineerId || null,
      // Office-created orders reference the engineer through assigned_to
      // (engineers.id) only. engineer_id / assigned_engineer_id stay null per the
      // schema decision — the notification trigger resolves the login from
      // assigned_to for this path.
      engineerId: null,
      officeTracking: {
        quotedCost: quotedCost.trim() && Number.isFinite(Number(quotedCost)) ? Number(quotedCost) : null,
        expectedDeliveryDate: expectedDelivery || null,
        quoteReference,
      },
    });

    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save order", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Order logged",
      description: selectedEngineer && !selectedEngineer.auth_user_id
        ? `Assigned to ${selectedEngineer.name} — they have no app login, so no notification was sent.`
        : "Added to the parts list",
    });
    reset();
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-500" /> New Order
          </DialogTitle>
          <DialogDescription>
            One part per order. A job link is optional — phoned-in orders can be logged against the customer alone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer</Label>
            {customer ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{customer.name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[customer.phone, customer.address].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCustomer(null)}>
                  Change
                </Button>
              </div>
            ) : manual ? (
              <div className="space-y-2">
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Customer name"
                />
                <Input
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  inputMode="tel"
                />
                <Input
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  placeholder="Address (optional)"
                />
                <button
                  type="button"
                  className="text-xs font-semibold text-primary"
                  onClick={() => { setManual(false); setManualName(""); setManualPhone(""); setManualAddress(""); }}
                >
                  Search existing customers instead
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or phone"
                    className="pl-9"
                  />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {results.length > 0 && (
                  <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                        onClick={() => { setCustomer(c); setSearch(""); setResults([]); }}
                      >
                        <p className="text-sm font-medium truncate">{c.name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[c.phone, c.address].filter(Boolean).join(" · ")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {!searching && search.trim().length >= 2 && results.length === 0 && (
                  <p className="text-xs text-muted-foreground">No matches.</p>
                )}
                <button
                  type="button"
                  className="text-xs font-semibold text-primary"
                  onClick={() => { setManual(true); setSearch(""); setResults([]); }}
                >
                  Customer not in the system — enter details manually
                </button>
              </div>
            )}
          </div>

          {/* Optional job link */}
          {customer && jobs.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="parts-order-job">Link to job (optional)</Label>
              <select
                id="parts-order-job"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">No job linked</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {[j.job_reference || "No ref", j.job_type, j.status].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Part */}
          <div className="space-y-2">
            <Label htmlFor="parts-order-desc">Part</Label>
            <Textarea
              id="parts-order-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Honeywell diverter valve"
              className="min-h-[70px]"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="parts-order-qty" className="text-muted-foreground">Qty</Label>
            <Input
              id="parts-order-qty"
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-20"
            />
          </div>

          <div className="flex gap-2">
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-full border-2 px-2 py-1.5 text-xs font-semibold transition-all ${
                    isSelected ? p.selected : `${p.border} ${p.text} bg-transparent`
                  }`}
                >
                  <span>{p.emoji}</span> {p.label}
                </button>
              );
            })}
          </div>

          {/* Cost / ETA / quote reference — office only (DB trigger enforces) */}
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="parts-order-cost" className="text-xs font-semibold">Quoted cost (€)</Label>
                <Input
                  id="parts-order-cost"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={quotedCost}
                  onChange={(e) => setQuotedCost(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parts-order-eta" className="text-xs font-semibold">Expected delivery</Label>
                <Input
                  id="parts-order-eta"
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parts-order-quote-ref" className="text-xs font-semibold">Quote reference</Label>
              <Input
                id="parts-order-quote-ref"
                placeholder="e.g. Q-2026-0114"
                value={quoteReference}
                onChange={(e) => setQuoteReference(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Supplier cost, for internal tracking only — this never changes what the customer is charged.
            </p>
          </div>

          {/* Engineer */}
          <div className="space-y-2">
            <Label htmlFor="parts-order-engineer">Assign to engineer (optional)</Label>
            <select
              id="parts-order-engineer"
              value={engineerId}
              onChange={(e) => setEngineerId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || "Unnamed"}{e.auth_user_id ? "" : " — no app login"}
                </option>
              ))}
            </select>
            {selectedEngineer && !selectedEngineer.auth_user_id && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <BellOff className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} />
                {selectedEngineer.name} has no app login, so they won't get status notifications. The order is still tracked here.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-amber-500 hover:bg-amber-500/90 text-white"
              onClick={handleSave}
              disabled={!canSave}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Log Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewPartsOrderSheet;
