import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Send, Edit2, CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import SendQuoteModal from "./SendQuoteModal";
import PaymentLinkForm from "./PaymentLinkForm";
import { validationBorderClass, ValidationMessage } from "@/components/shared/FormValidation";
import FormLeaveGuard from "@/components/shared/FormLeaveGuard";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";

type Quote = {
  id: string;
  job_id: string;
  description: string;
  parts_cost: number | null;
  labour_cost: number | null;
  callout_cost: number | null;
  total_amount: number;
  status: string;
  sent_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  payment_link: string | null;
  deposit_amount: number | null;
  converted_job_id: string | null;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  eircode: string;
};

type Props = {
  jobId: string;
  customerId: string;
  customer: Customer;
  onQuoteChange: () => void;
};

const quoteStatusBadge = (status: string) => {
  const map: Record<string, { bg: string; text: string }> = {
    Draft: { bg: "bg-muted", text: "text-muted-foreground" },
    Sent: { bg: "bg-primary/10", text: "text-primary" },
    Accepted: { bg: "bg-[hsl(142,76%,92%)]", text: "text-[hsl(142,72%,29%)]" },
    Rejected: { bg: "bg-destructive/10", text: "text-destructive" },
    Paid: { bg: "bg-[hsl(160,84%,90%)]", text: "text-[hsl(160,84%,18%)] font-bold" },
  };
  const s = map[status] || map.Draft;
  return <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>{status}</span>;
};

const QuotePanel = ({ jobId, customerId, customer, onQuoteChange }: Props) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendModal, setSendModal] = useState<"whatsapp" | "email" | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Form state
  const [description, setDescription] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [partsCost, setPartsCost] = useState("");
  const [labourCost, setLabourCost] = useState("");
  const [calloutCost, setCalloutCost] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);

  useEffect(() => {
    fetchQuote();
  }, [jobId]);

  const fetchQuote = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();
    if (data) setQuote(data as Quote);
    else setQuote(null);
    setLoading(false);
  };

  const calculatedTotal = showBreakdown
    ? (parseFloat(partsCost) || 0) + (parseFloat(labourCost) || 0) + (parseFloat(calloutCost) || 0)
    : parseFloat(totalAmount) || 0;

  const handleSave = async (andSend?: "whatsapp" | "email") => {
    const errs: Record<string, boolean> = {};
    if (!description.trim()) errs.description = true;
    if (calculatedTotal <= 0) errs.total = true;
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    if (!user) return;
    setSaving(true);
    const payload = {
      job_id: jobId,
      customer_id: customerId,
      user_id: user.id,
      organisation_id: orgId!,
      description: description.trim(),
      parts_cost: showBreakdown ? parseFloat(partsCost) || 0 : null,
      labour_cost: showBreakdown ? parseFloat(labourCost) || 0 : null,
      callout_cost: showBreakdown ? parseFloat(calloutCost) || 0 : null,
      total_amount: calculatedTotal,
      status: "Draft",
    };

    let result;
    if (quote && editing) {
      result = await supabase.from("quotes").update(payload as any).eq("id", quote.id).select().maybeSingle();
    } else {
      result = await supabase.from("quotes").insert([payload] as any).select().maybeSingle();
      // Update has_quote flag
      await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({ has_quote: true } as any)).eq("id", jobId);
    }

    setSaving(false);
    if (result.error) {
      toast({ title: "Error", description: result.error.message, variant: "destructive" });
      return;
    }

    toast({ title: quote ? "Quote updated" : "Quote saved" });
    setCreating(false);
    setEditing(false);
    await fetchQuote();
    onQuoteChange();

    if (andSend && result.data) {
      setSendModal(andSend);
    }
  };

  const handleStatusUpdate = async (newStatus: string, extraFields: Record<string, any> = {}) => {
    if (!quote) return;
    const { error } = await supabase
      .from("quotes")
      .update({ status: newStatus, ...extraFields } as any)
      .eq("id", quote.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Auto-create job when accepted
    if (newStatus === "Accepted" && !quote.converted_job_id && user) {
      const quoteRef = `Q-${quote.id.slice(0, 4).toUpperCase()}`;
      // Get original job details for engineer & type
      const { data: origJob } = await supabase.from("service_calls")
        .select("job_type, assigned_engineer, assigned_engineer_id")
        .eq("id", quote.job_id)
        .maybeSingle();

      const { data: newJob, error: jobErr } = await supabase.from("service_calls").insert({
        customer_id: customerId,
        user_id: user.id,
        organisation_id: orgId!,
        job_type: (origJob as any)?.job_type || "Repair",
        job_issue: quote.description,
        assigned_engineer: (origJob as any)?.assigned_engineer || null,
        assigned_engineer_id: (origJob as any)?.assigned_engineer_id || null,
        status: "Pending",
        has_quote: true,
        notes: `Created from quote ${quoteRef}`,
        source: "Quote",
        revenue: quote.total_amount || null,
        // Nothing collected yet on a freshly converted quote — full total outstanding.
        balance_due: quote.total_amount || null,

      } as any).select("id").single();

      if (newJob && !jobErr) {
        await supabase.from("quotes").update({ converted_job_id: newJob.id } as any).eq("id", quote.id);
        toast({ title: `Job created from quote ${quoteRef}` });
      } else {
        toast({ title: `Quote marked as ${newStatus}` });
      }
    } else {
      toast({ title: `Quote marked as ${newStatus}` });
    }

    await fetchQuote();
    onQuoteChange();
  };

  const startEdit = () => {
    if (!quote) return;
    setDescription(quote.description);
    setShowBreakdown(!!(quote.parts_cost || quote.labour_cost || quote.callout_cost));
    setPartsCost(quote.parts_cost?.toString() || "");
    setLabourCost(quote.labour_cost?.toString() || "");
    setCalloutCost(quote.callout_cost?.toString() || "");
    setTotalAmount(quote.total_amount.toString());
    setEditing(true);
  };

  if (loading) return <Card><CardContent className="p-6 text-center text-muted-foreground">Loading quote...</CardContent></Card>;

  // No quote yet
  if (!quote && !creating) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center space-y-3">
          <p className="text-lg">📋 No quote yet</p>
          <p className="text-sm text-muted-foreground">Create a quote to send pricing to the customer for approval.</p>
          <Button onClick={() => { setCreating(true); setDescription(""); setPartsCost(""); setLabourCost(""); setCalloutCost(""); setTotalAmount(""); setShowBreakdown(false); }}>
            <Plus className="w-4 h-4 mr-1" /> Create Quote
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Quote form (create or edit)
  if (creating || editing) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-bold text-base">{editing ? "Edit Quote" : "Create Quote"}</h3>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Quote Description *</Label>
            <Input
              value={description}
              onChange={(e) => { setDescription(e.target.value); setFormErrors(er => ({ ...er, description: false })); }}
              onBlur={() => { if (!description.trim()) setFormErrors(er => ({ ...er, description: true })); }}
              placeholder="e.g. Replace faulty burner unit and test system"
              className={validationBorderClass(!!formErrors.description)}
            />
            <ValidationMessage show={!!formErrors.description} />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={showBreakdown} onCheckedChange={setShowBreakdown} />
            <Label className="text-xs">Optional Price Breakdown</Label>
          </div>

          {showBreakdown ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Parts €</Label>
                  <Input type="number" value={partsCost} onChange={(e) => setPartsCost(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Labour €</Label>
                  <Input type="number" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Call-Out €</Label>
                  <Input type="number" value={calloutCost} onChange={(e) => setCalloutCost(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="border-t border-border pt-2">
                <p className="text-sm font-bold">Total: €{calculatedTotal.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Total Price € *</Label>
              <Input
                type="number"
                value={totalAmount}
                onChange={(e) => { setTotalAmount(e.target.value); setFormErrors(er => ({ ...er, total: false })); }}
                onBlur={() => { if (!showBreakdown && (parseFloat(totalAmount) || 0) <= 0) setFormErrors(er => ({ ...er, total: true })); }}
                placeholder="0"
                className={validationBorderClass(!!formErrors.total)}
              />
              <ValidationMessage show={!!formErrors.total} />
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => {
              const isDirty = description.trim() || totalAmount.trim() || partsCost.trim() || labourCost.trim() || calloutCost.trim();
              if (isDirty) { setShowLeaveGuard(true); } else { setCreating(false); setEditing(false); setFormErrors({}); }
            }}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave()} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              <Save className="w-4 h-4 mr-1" /> Save as Draft
            </Button>
            <Button onClick={() => handleSave("whatsapp")} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              <Send className="w-4 h-4 mr-1" /> Send to Customer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Quote display
  return (
    <>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base">QUOTE</h3>
            {quoteStatusBadge(quote!.status)}
          </div>

          <p className="text-sm">{quote!.description}</p>

          {(quote!.parts_cost || quote!.labour_cost || quote!.callout_cost) && (
            <div className="border-t border-border pt-3 space-y-1 text-sm">
              {quote!.parts_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>€{Number(quote!.parts_cost).toFixed(2)}</span></div> : null}
              {quote!.labour_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Labour</span><span>€{Number(quote!.labour_cost).toFixed(2)}</span></div> : null}
              {quote!.callout_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Call-Out</span><span>€{Number(quote!.callout_cost).toFixed(2)}</span></div> : null}
            </div>
          )}

          <div className="border-t border-border pt-3">
            <div className="flex justify-between text-lg font-extrabold">
              <span>TOTAL</span>
              <span>€{Number(quote!.total_amount).toFixed(2)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {(quote!.status === "Draft" || quote!.status === "Sent") && (
              <>
                <Button size="sm" onClick={() => setSendModal("whatsapp")}>📲 Send via WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={() => setSendModal("email")}>📧 Send via Email</Button>
                <Button size="sm" variant="ghost" onClick={startEdit}><Edit2 className="w-4 h-4 mr-1" /> Edit</Button>
              </>
            )}
            {quote!.status === "Sent" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusUpdate("Accepted", { accepted_at: new Date().toISOString() })}>
                🧾 Mark as Accepted
              </Button>
            )}
            {(quote!.status === "Accepted" || quote!.payment_link) && !quote!.paid_at && (
              <Button size="sm" onClick={() => handleStatusUpdate("Paid", { paid_at: new Date().toISOString() })}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Paid
              </Button>
            )}
            {!quote!.payment_link && !showPaymentForm && (quote!.status === "Sent" || quote!.status === "Accepted") && (
              <Button size="sm" variant="ghost" onClick={() => setShowPaymentForm(true)}>
                <CreditCard className="w-4 h-4 mr-1" /> Add Payment Link
              </Button>
            )}
            {quote!.payment_link && (
              <span className="text-xs text-success font-semibold flex items-center gap-1">
                💳 Payment Link Added ✓
                <button className="underline text-primary text-xs" onClick={() => setShowPaymentForm(true)}>Edit</button>
              </span>
            )}
            {quote!.converted_job_id && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/jobs/${quote!.converted_job_id}`)}>
                📋 View Job
              </Button>
            )}
          </div>

          {/* Payment Link Form */}
          {showPaymentForm && (
            <PaymentLinkForm
              quoteId={quote!.id}
              currentLink={quote!.payment_link}
              currentDeposit={quote!.deposit_amount}
              totalAmount={Number(quote!.total_amount)}
              onSaved={() => { setShowPaymentForm(false); fetchQuote(); }}
              onCancel={() => setShowPaymentForm(false)}
            />
          )}
        </CardContent>
      </Card>

      {/* Send Modal */}
      {sendModal && quote && (
        <SendQuoteModal
          mode={sendModal}
          quote={quote}
          customer={customer}
          onClose={() => setSendModal(null)}
          onSent={async () => {
            await handleStatusUpdate("Sent", { sent_at: new Date().toISOString() });
            setSendModal(null);
          }}
        />
      )}

      <FormLeaveGuard
        open={showLeaveGuard}
        onKeepEditing={() => setShowLeaveGuard(false)}
        onLeave={() => { setShowLeaveGuard(false); setCreating(false); setEditing(false); setFormErrors({}); }}
      />
    </>
  );
};

export default QuotePanel;
