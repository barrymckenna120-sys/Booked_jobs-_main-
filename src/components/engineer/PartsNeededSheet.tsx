import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Wrench, Loader2, X, Search } from "lucide-react";
import type { PartLineInput, PartPriority } from "@/lib/partsRequests";

const PRIORITIES: { value: PartPriority; label: string; emoji: string; border: string; text: string; bg: string }[] = [
  { value: "urgent", label: "Urgent", emoji: "🔴", border: "border-[#DC2626]", text: "text-[#DC2626]", bg: "bg-[#DC2626] text-white border-[#DC2626]" },
  { value: "normal", label: "Normal", emoji: "🟡", border: "border-[#D97706]", text: "text-[#D97706]", bg: "bg-[#D97706] text-white border-[#D97706]" },
  { value: "low",    label: "Low",    emoji: "🟢", border: "border-[#16A34A]", text: "text-[#16A34A]", bg: "bg-[#16A34A] text-white border-[#16A34A]" },
];

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
}

/** Either a picked customer id or a typed-in name — the DB requires one of them. */
export interface PartCustomerSelection {
  customerId: string | null;
  customerName: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** One request = one part. Log a second part with a second submission. */
  onConfirm: (part: PartLineInput, customer?: PartCustomerSelection) => void;
  loading?: boolean;
  /** Job-less requests have no customer context, so ask for one. Off by default. */
  requireCustomer?: boolean;
  /** Scopes the customer search when requireCustomer is on. */
  organisationId?: string | null;
}

const PartsNeededSheet = ({ open, onClose, onConfirm, loading, requireCustomer, organisationId }: Props) => {
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<PartPriority>("normal");
  const [quantity, setQuantity] = useState("1");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");

  // Debounced customer search — same query shape as the office New Order form.
  useEffect(() => {
    if (!open || !requireCustomer || !organisationId) return;
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
  }, [search, open, requireCustomer, organisationId, customer, manual]);

  if (!open) return null;

  const reset = () => {
    setDescription("");
    setPriority("normal");
    setQuantity("1");
    setSearch("");
    setResults([]);
    setCustomer(null);
    setManual(false);
    setManualName("");
  };

  const hasCustomer = !!customer || manualName.trim().length > 0;
  const canConfirm = description.trim().length > 0 && (!requireCustomer || hasCustomer);


  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canConfirm) return;
    const parsedQty = parseInt(quantity, 10);
    onConfirm({
      description: description.trim(),
      priority,
      quantity: Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1,
    });
    reset();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    reset();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      style={{ pointerEvents: "all" }}
      onClick={handleCancel}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className="relative bg-background border rounded-2xl max-w-[92vw] sm:max-w-md w-full p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col space-y-1.5 text-left">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <Wrench className="w-5 h-5 text-amber-500" /> Part Needed
          </h2>
          <p className="text-sm text-muted-foreground pt-1">
            One part per request. Need a second part? Submit this, then log it again.
          </p>
        </div>

        <div className="space-y-4 pt-4">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Thermocouple"
            className="min-h-[70px]"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
          />

          <div className="flex items-center gap-3">
            <label htmlFor="part-qty" className="text-sm text-muted-foreground">
              Qty
            </label>
            <Input
              id="part-qty"
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
                  onClick={(e) => { e.stopPropagation(); setPriority(p.value); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-full border-2 px-2 py-1.5 text-xs font-semibold transition-all ${
                    isSelected ? p.bg : `${p.border} ${p.text} bg-transparent`
                  }`}
                >
                  <span>{p.emoji}</span> {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-amber-500 hover:bg-amber-500/90 text-white"
              onClick={handleConfirm}
              disabled={loading || !canConfirm}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PartsNeededSheet;
