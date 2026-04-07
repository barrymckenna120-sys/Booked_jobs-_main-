import { useState, useEffect, useRef } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Search } from "lucide-react";

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

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
}

const ExtraWorkSheet = ({ job, customer, onClose }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
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
  );

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();

    const orgId = profile?.organisation_id;
    if (!orgId) {
      toast({ title: "Error", description: "Could not determine organisation.", variant: "destructive" });
      setSaving(false);
      return;
    }

    const cleanItems = lineItems.map((li) => ({
      description: li.description.trim(),
      quantity: li.quantity,
      unit_price: li.unit_price,
      line_total: li.line_total,
    }));

    const { error } = await supabase.from("quotes").insert({
      job_id: job.id,
      customer_id: job.customer_id,
      user_id: job.user_id,
      organisation_id: orgId,
      description: "Extra work",
      total_amount: subtotal,
      status: "Pending Approval",
      line_items: cleanItems,
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Extra work submitted", description: `${getJobRef(job)} · €${subtotal.toFixed(2)}` });
      onClose();
    }
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

        <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-xs text-muted-foreground">
          This creates a quote linked to <strong>{getJobRef(job)}</strong> with status{" "}
          <strong>Pending Approval</strong>. Office will review before sending.
        </div>

        <Button
          className="w-full h-12 text-base font-extrabold"
          disabled={!isValid || saving}
          onClick={handleSubmit}
        >
          {saving ? "Submitting…" : "Submit Extra Work"}
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

  // Close dropdown on outside click
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
      {/* Remove button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove item"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Description / Product search */}
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

      {/* Qty / Unit Price / Total */}
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
