import { useState, useEffect, useRef } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Search, Banknote, CreditCard, FileText } from "lucide-react";

const getJobRef = (job: any) => job?.job_reference || `KN-${job?.id?.slice(0, 6).toUpperCase() || '???'}`;

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Product = {
  id: string;
  name: string;
  unit_price: number;
};

type PaymentMethod = "cash" | "card" | "invoice" | null;

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote; desc: string }[] = [
  { value: "cash", label: "Cash", icon: Banknote, desc: "Customer paying on site with cash" },
  { value: "card", label: "Card", icon: CreditCard, desc: "Customer paying on site by card" },
  { value: "invoice", label: "Invoice", icon: FileText, desc: "Customer not on site, send payment link" },
];

const ExtraWorkSheet = ({ job, customer, onClose }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0, line_total: 0 },
  ]);

  useEffect(() => {
    supabase
      .from("products")
      .select("id, name, unit_price")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setProducts(data);
      });
  }, []);

  const subtotal = lineItems.reduce((sum, li) => sum + li.line_total, 0);

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setLineItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], ...patch };
      item.line_total = Math.round(item.quantity * item.unit_price * 100) / 100;
      next[index] = item;
      return next;
    });
  };

  const addItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0, line_total: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const isValid = lineItems.length > 0 && lineItems.every(
    (li) => li.description.trim() && li.quantity >= 1 && li.unit_price > 0
  ) && paymentMethod !== null;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const cleanItems = lineItems.map((li) => ({
      description: li.description.trim(),
      quantity: li.quantity,
      unit_price: li.unit_price,
      line_total: li.line_total,
    }));

    const payload = {
      user_id: job.user_id,
      organisation_id: job.organisation_id,
      customer_id: job.customer_id,
      job_id: job.id,
      description: "Extra work",
      total_amount: subtotal,
      status: "Pending Approval",
      line_items: cleanItems,
      job_type: "Extra Work",
    };

    console.log("[ExtraWork] cleanItems:", JSON.stringify(cleanItems));
    console.log("[ExtraWork] subtotal:", subtotal);
    console.log("[ExtraWork] paymentMethod:", paymentMethod);
    console.log("[ExtraWork] full payload:", JSON.stringify(payload));

    const { data: quoteData, error } = await supabase.from("quotes").insert([payload] as any).select("id").single();

    if (error) {
      setSaving(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    const quoteId = quoteData?.id;

    // Handle cash or card — update service_calls revenue
    if (paymentMethod === "cash" || paymentMethod === "card") {
      const patch = buildPaymentPatch({
        type: "increment",
        amount: subtotal,
        revenue: job.revenue || 0,
        currentBalanceDue: job.balance_due || 0,
      });

      const { error: updateErr } = await supabase
        .from("service_calls")
        .update(patch as any)
        .eq("id", job.id);

      if (updateErr) {
        console.error("[ExtraWork] Failed to update service_calls:", updateErr.message);
      }

      setSaving(false);
      toast({
        title: "Extra work added",
        description: `${getJobRef(job)} · €${subtotal.toFixed(2)} collected on site`,
      });
      onClose();
      return;
    }

    // Handle invoice — send payment link via WhatsApp
    if (paymentMethod === "invoice" && quoteId) {
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("send-extrawork-payment-link", {
          body: {
            quote_id: quoteId,
            service_call_id: job.id,
            customer_id: job.customer_id,
            total_amount: subtotal,
            line_items: cleanItems,
          },
        });

        if (fnError) {
          console.error("[ExtraWork] Edge function error:", fnError);
          toast({
            title: "Extra work saved",
            description: "Quote created but WhatsApp send failed. Office can resend.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Extra work quote sent",
            description: `Sent to ${customer.name} via WhatsApp`,
          });
        }
      } catch (err) {
        console.error("[ExtraWork] invoke error:", err);
        toast({
          title: "Extra work saved",
          description: "Quote created but WhatsApp send failed.",
          variant: "destructive",
        });
      }
    }

    setSaving(false);
    onClose();
  };

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground">＋ Extra Work</div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          {getJobRef(job)} · {customer.name}
        </div>
      </div>

      <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto max-h-[calc(100vh-220px)]">
        {lineItems.map((item, idx) => (
          <LineItemRow
            key={idx}
            item={item}
            index={idx}
            products={products}
            onChange={updateItem}
            onRemove={lineItems.length > 1 ? () => removeItem(idx) : undefined}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-11 text-sm font-semibold"
          onClick={addItem}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add Item
        </Button>

        {/* Subtotal */}
        <div className="flex justify-between items-center border-t border-border pt-3">
          <span className="text-sm font-bold text-muted-foreground">SUBTOTAL</span>
          <span className="text-lg font-extrabold">€{subtotal.toFixed(2)}</span>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            How is this being paid?
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = paymentMethod === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                    selected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-bold">{opt.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-xs text-muted-foreground">
          {paymentMethod === "invoice" ? (
            <>This will send a payment link to <strong>{customer.name}</strong> via WhatsApp for <strong>€{subtotal.toFixed(2)}</strong>.</>
          ) : paymentMethod ? (
            <>Extra work of <strong>€{subtotal.toFixed(2)}</strong> will be added to <strong>{getJobRef(job)}</strong> and collected on site.</>
          ) : (
            <>Select a payment method to continue.</>
          )}
        </div>

        <Button
          className="w-full h-12 text-base font-extrabold"
          disabled={!isValid || saving}
          onClick={handleSubmit}
        >
          {saving
            ? "Submitting…"
            : paymentMethod === "invoice"
            ? "Send Payment Link"
            : "Submit Extra Work"}
        </Button>
        <button
          onClick={onClose}
          className="w-full text-center text-muted-foreground text-sm font-semibold py-1"
        >
          Cancel
        </button>
      </div>
    </EngineerSheet>
  );
};

/* ─── Line Item Row ─── */

function LineItemRow({
  item,
  index,
  products,
  onChange,
  onRemove,
}: {
  item: LineItem;
  index: number;
  products: Product[];
  onChange: (index: number, patch: Partial<LineItem>) => void;
  onRemove?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  const selectProduct = (p: Product) => {
    onChange(index, {
      description: p.name,
      unit_price: Number(p.unit_price),
    });
    setSearch("");
    setShowDropdown(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="border border-border rounded-xl p-3 space-y-3 relative">
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove item"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="space-y-1.5" ref={wrapRef}>
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Item {index + 1}
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={item.description}
            onChange={(e) => {
              onChange(index, { description: e.target.value });
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search products or type description…"
            className="pl-8"
          />
        </div>
        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-50 left-3 right-3 bg-background border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {filtered.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 flex justify-between items-center"
                onClick={() => selectProduct(p)}
              >
                <span className="truncate mr-2">{p.name}</span>
                <span className="text-muted-foreground text-xs font-semibold whitespace-nowrap">
                  €{Number(p.unit_price).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Qty</Label>
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) =>
              onChange(index, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
            }
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Unit € </Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={item.unit_price || ""}
            onChange={(e) =>
              onChange(index, { unit_price: parseFloat(e.target.value) || 0 })
            }
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Total</Label>
          <Input
            readOnly
            value={`€${item.line_total.toFixed(2)}`}
            className="h-10 bg-muted/50 font-semibold"
          />
        </div>
      </div>
    </div>
  );
}

export default ExtraWorkSheet;
