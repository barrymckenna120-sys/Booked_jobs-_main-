import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { CalendarIcon, Plus, Trash2, Loader2, Save, Send, Search, MessageCircle } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const JOB_TYPES = ["Boiler Service", "Boiler Repair", "Boiler Replacement", "Heating Upgrade", "Power Flush", "Other"];

type LineItem = {
  id: string;
  description: string;
  qty: string;
  unit_price: string;
  cost_price: string;
  product_id: string | null;
};

type QuoteFormProps = {
  quoteId?: string;
  onSaved?: () => void;
};

const QuoteForm = ({ quoteId, onSaved }: QuoteFormProps) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState("");

  // Form fields
  const [customerId, setCustomerId] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ id: crypto.randomUUID(), description: "", qty: "1", unit_price: "", cost_price: "", product_id: null }]);
  const [discount, setDiscount] = useState("0");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(23);
  const [deposit, setDeposit] = useState("0");
  const [depositManuallySet, setDepositManuallySet] = useState(false);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date | undefined>();

  // Autocomplete states
  const [activeProductSearch, setActiveProductSearch] = useState<string | null>(null);

  // Fetch settings defaults
  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone, address").eq("is_archived", false).order("name");
      if (error) console.error("Customer fetch error:", error);
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("active", true).order("name");
      return data || [];
    },
  });

  // Load existing quote for editing
  useEffect(() => {
    if (!quoteId) return;
    const loadQuote = async () => {
      const { data: q } = await supabase.from("quotes").select("*").eq("id", quoteId).single();
      if (!q) return;
      setCustomerId(q.customer_id);
      setJobType((q as any).job_type || "");
      setJobDescription(q.description || "");
      setDiscount(String((q as any).discount ?? 0));
      setVatEnabled((q as any).vat_enabled ?? false);
      setVatRate(Number((q as any).vat_rate ?? 23));
      setDeposit(String((q as any).deposit ?? 0));
      setDepositManuallySet(true); // Existing quote has saved deposit
      setNotes(q.notes || "");
      setTerms((q as any).terms || "");
      setExpiryDate((q as any).expiry_date ? new Date((q as any).expiry_date) : undefined);
      setQuoteNumber((q as any).quote_number || "");

      // Load line items
      const { data: items } = await supabase.from("quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order");
      if (items && items.length > 0) {
        setLineItems(items.map((i: any) => ({
          id: i.id,
          description: i.description,
          qty: String(i.qty),
          unit_price: String(i.unit_price),
          product_id: i.product_id,
        })));
      }
    };
    loadQuote();
  }, [quoteId]);

  // Apply settings defaults when creating new quote
  useEffect(() => {
    if (quoteId || !settings) return;
    setTerms((settings as any).default_terms || "");
    setVatEnabled((settings as any).default_vat_enabled ?? false);
    setDeposit(String((settings as any).default_deposit ?? 0));
    const days = (settings as any).default_expiry_days ?? 30;
    setExpiryDate(addDays(new Date(), days));
  }, [settings, quoteId]);

  // Calculations
  const subtotal = useMemo(() => lineItems.reduce((s, li) => s + (parseFloat(li.qty) || 0) * (parseFloat(li.unit_price) || 0), 0), [lineItems]);
  const discountNum = parseFloat(discount) || 0;
  const afterDiscount = Math.max(subtotal - discountNum, 0);
  const vatAmount = vatEnabled ? afterDiscount * (vatRate / 100) : 0;
  const total = Math.max(afterDiscount + vatAmount, 0);
  const depositNum = parseFloat(deposit) || 0;
  const balanceDue = Math.max(total - depositNum, 0);

  // Auto-set deposit to configured % of total unless user manually overrode
  const depositPct = (settings as any)?.deposit_percentage ?? 50;
  useEffect(() => {
    if (!depositManuallySet) {
      setDeposit((Math.round(total * depositPct) / 100).toFixed(2));
    }
  }, [total, depositManuallySet, depositPct]);

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setLineItems((prev) => prev.map((li) => li.id === id ? { ...li, [field]: value } : li));
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { id: crypto.randomUUID(), description: "", qty: "1", unit_price: "", product_id: null }]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  };

  const selectProduct = (lineId: string, product: any) => {
    setLineItems((prev) => prev.map((li) => li.id === lineId ? { ...li, description: product.name, unit_price: String(product.unit_price), product_id: product.id } : li));
    setActiveProductSearch(null);
  };

  const handleSave = async (sendNow: boolean, sendWhatsApp: boolean = false) => {
    if (!user || !customerId) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    if (lineItems.every((li) => !li.description.trim())) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }

    setSaving(true);
    const status = sendNow ? "Sent" : "Draft";
    const quotePayload: any = {
      user_id: user.id,
      organisation_id: orgId!,
      customer_id: customerId,
      job_id: customerId,
      description: jobDescription.trim(),
      job_type: jobType || "other",
      total_amount: total,
      discount: discountNum,
      deposit: depositNum,
      balance_due: balanceDue > 0 ? balanceDue : 0,
      vat_enabled: vatEnabled,
      vat_rate: vatRate,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      expiry_date: expiryDate ? format(expiryDate, "yyyy-MM-dd") : null,
      status,
      ...(sendNow ? { sent_at: new Date().toISOString() } : {}),
    };

    let savedQuoteId = quoteId;
    let savedQuoteNumber = quoteNumber;

    if (quoteId) {
      const { error } = await supabase.from("quotes").update(quotePayload).eq("id", quoteId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
      await supabase.from("quote_line_items").delete().eq("quote_id", quoteId);
    } else {
      const { data: existingJobs } = await supabase.from("service_calls").select("id").eq("customer_id", customerId).eq("user_id", user.id).eq("status", "Pending").order("created_at", { ascending: false }).limit(1);
      let jobId = existingJobs?.[0]?.id;
      if (!jobId) {
        const { data: newJob } = await supabase.from("service_calls").insert({
          customer_id: customerId,
          user_id: user.id,
          organisation_id: orgId!,
          job_type: jobType || "Other",
          job_issue: jobDescription.trim(),
          status: "Pending",
          has_quote: true,
          source: "Quote",
        } as any).select("id").single();
        jobId = newJob?.id;
      }
      if (!jobId) { toast({ title: "Error creating job", variant: "destructive" }); setSaving(false); return; }

      quotePayload.job_id = jobId;
      const { data: newQuote, error } = await supabase.from("quotes").insert(quotePayload).select("id, quote_number").single();
      if (error || !newQuote) { toast({ title: "Error", description: error?.message, variant: "destructive" }); setSaving(false); return; }
      savedQuoteId = newQuote.id;
      savedQuoteNumber = (newQuote as any).quote_number || "";
      setQuoteNumber(savedQuoteNumber);
    }

    const itemsPayload = lineItems.filter((li) => li.description.trim()).map((li, i) => ({
      quote_id: savedQuoteId,
      product_id: li.product_id || null,
      description: li.description.trim(),
      qty: parseFloat(li.qty) || 1,
      unit_price: parseFloat(li.unit_price) || 0,
      sort_order: i,
    }));
    if (itemsPayload.length > 0) {
      await supabase.from("quote_line_items").insert(itemsPayload);
    }

    if (sendWhatsApp && savedQuoteId) {
      const customer = customers.find((c: any) => c.id === customerId);
      if (customer) {
        // Generate PDF first (best-effort — do not block WhatsApp send on failure)
        let pdfUrl: string | undefined;
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const pdfRes = await fetch(`https://${projectId}.supabase.co/functions/v1/generate-quote-pdf`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
              "apikey": anonKey,
            },
            body: JSON.stringify({ quote_id: savedQuoteId }),
          });
          const pdfResult = await pdfRes.json().catch(() => ({}));
          if (pdfRes.ok && pdfResult?.success && pdfResult?.pdf_url) {
            pdfUrl = pdfResult.pdf_url;
            await supabase.from("quotes").update({ pdf_url: pdfUrl } as any).eq("id", savedQuoteId);
          }
        } catch {
          // Swallow — proceed without PDF
        }

        try {
          const { error: waError } = await supabase.functions.invoke("send-quote-whatsapp", {
            body: {
              quote_id: savedQuoteId,
              customer_name: customer.name,
              mobile_number: customer.phone,
              job_description: jobDescription.trim() || jobType || "Quote",
              quote_amount: total,
              deposit_amount: depositNum,
              quote_number: savedQuoteNumber,
              ...(pdfUrl ? { pdf_url: pdfUrl } : {}),
            },
          });
          if (waError) {
            toast({ title: "Quote saved but WhatsApp failed", description: String(waError.message || ""), variant: "destructive" });
          } else {
            toast({ title: "Quote sent via WhatsApp ✓" });
          }
        } catch {
          toast({ title: "Quote saved but WhatsApp failed", variant: "destructive" });
        }
      }
    } else {
      toast({ title: sendNow ? "Quote sent" : "Quote saved as draft" });
    }

    setSaving(false);
    if (onSaved) onSaved();
    else navigate("/quotes");
  };

  const selectedCustomer = customers.find((c: any) => c.id === customerId);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Quote Number */}
      {quoteNumber && (
        <div className="text-center">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quote</span>
          <h2 className="text-2xl font-extrabold text-foreground">{quoteNumber}</h2>
        </div>
      )}

      {/* Customer & Job Type */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} — {c.address}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Job Type</Label>
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger><SelectValue placeholder="Select job type…" /></SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Job Description</Label>
            <Textarea rows={2} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="e.g. Replace faulty burner unit and test system" />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Line Items</h3>
          {lineItems.map((li, idx) => (
            <div key={li.id} className="space-y-2 pb-3 border-b border-border last:border-0 last:pb-0">
              <div className="relative">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input
                  value={li.description}
                  onChange={(e) => { updateLineItem(li.id, "description", e.target.value); setActiveProductSearch(li.id); }}
                  onFocus={() => setActiveProductSearch(li.id)}
                  onBlur={() => setTimeout(() => setActiveProductSearch(null), 200)}
                  placeholder="Type to search products or enter custom…"
                />
                <p className="text-xs text-muted-foreground mt-1">Type or click to search products</p>
                {activeProductSearch === li.id && (() => {
                  const matches = li.description.trim().length === 0
                    ? products.slice(0, 10)
                    : products.filter((p: any) => p.name.toLowerCase().includes(li.description.toLowerCase())).slice(0, 10);
                  if (matches.length === 0) return null;
                  const grouped: Record<string, any[]> = {};
                  matches.forEach((p: any) => {
                    const cat = (p as any).category || "Parts";
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(p);
                  });
                  return (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-auto">
                      {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat}>
                          <div className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/50">{cat}</div>
                          {items.map((p: any) => (
                            <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors" onMouseDown={() => selectProduct(li.id, p)}>
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground ml-2">€{Number(p.unit_price).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input type="number" value={li.qty} onChange={(e) => updateLineItem(li.id, "qty", e.target.value)} placeholder="1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Unit Price €</Label>
                  <Input type="number" value={li.unit_price} onChange={(e) => updateLineItem(li.id, "unit_price", e.target.value)} placeholder="0.00" />
                </div>
                <div className="pb-0.5">
                  <Label className="text-xs text-muted-foreground">Total</Label>
                  <p className="text-sm font-bold text-foreground h-10 flex items-center">€{((parseFloat(li.qty) || 0) * (parseFloat(li.unit_price) || 0)).toFixed(2)}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => removeLineItem(li.id)} disabled={lineItems.length <= 1}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLineItem}><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Pricing Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm text-muted-foreground">Discount €</Label>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28 text-right" placeholder="0.00" />
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-semibold text-destructive">−€{discountNum.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
                <Label className="text-sm text-muted-foreground">VAT</Label>
                {vatEnabled && (
                  <div className="flex items-center gap-1 ml-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={vatRate === 13.5 ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setVatRate(13.5)}
                    >
                      13.5%
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={vatRate === 23 ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setVatRate(23)}
                    >
                      23%
                    </Button>
                  </div>
                )}
              </div>
              {vatEnabled && <span className="text-sm font-semibold">€{vatAmount.toFixed(2)}</span>}
            </div>
            <div className="flex justify-between text-base font-extrabold border-t border-border pt-2">
              <span>Total</span>
              <span>€{total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm text-muted-foreground">Deposit €</Label>
              <Input type="number" value={deposit} onChange={(e) => { setDeposit(e.target.value); setDepositManuallySet(true); }} className="w-28 text-right" placeholder="0.00" />
            </div>
            {depositNum > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Deposit</span>
                <span className="font-semibold">−€{depositNum.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
              <span className="text-muted-foreground">Balance Due</span>
              <span className="text-foreground">€{balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes, Terms, Expiry */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal or customer-facing notes…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Terms & Conditions</Label>
            <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, warranty info…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Expiry Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !expiryDate && "text-muted-foreground")}>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {expiryDate ? format(expiryDate, "dd MMM yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={expiryDate} onSelect={setExpiryDate} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pb-8">
        <Button variant="outline" className="w-full" onClick={() => handleSave(false)} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          <Save className="w-4 h-4 mr-1" /> Save Draft
        </Button>
        <Button className="w-full py-5 text-base bg-[#25D366] hover:bg-[#1da851] text-white" onClick={() => handleSave(true, true)} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          <MessageCircle className="w-4 h-4 mr-2" /> Send & WhatsApp
        </Button>
      </div>
    </div>
  );
};

export default QuoteForm;
