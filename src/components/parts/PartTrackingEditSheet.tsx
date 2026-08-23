import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  markCustomerNotified,
  updatePartsOfficeFields,
  NOTIFIED_METHOD_LABEL,
  type NotifiedMethod,
} from "@/lib/partsRequests";

/**
 * BJ-0071 / BJ-0072 — office-only editor for a part's tracking detail.
 *
 * Cost here is SUPPLIER cost, recorded so staff can see what a job cost the
 * business. It is deliberately NOT connected to revenue, quotes or invoicing —
 * changing what the customer is charged stays a separate, explicit action.
 *
 * Only rendered for office roles; the DB trigger
 * protect_parts_request_office_fields is the real enforcement.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  part: any;
  onSaved: () => void;
}

const toNumberOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const PartTrackingEditSheet = ({ open, onClose, part, onSaved }: Props) => {
  const [quoted, setQuoted] = useState(part?.quoted_cost != null ? String(part.quoted_cost) : "");
  const [actual, setActual] = useState(part?.actual_cost != null ? String(part.actual_cost) : "");
  const [eta, setEta] = useState(part?.expected_delivery_date ?? "");
  const [quoteRef, setQuoteRef] = useState(part?.quote_reference ?? "");
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState<NotifiedMethod | null>(null);

  const save = async () => {
    if (quoted.trim() && toNumberOrNull(quoted) === null) {
      toast.error("Quoted cost must be a number of 0 or more");
      return;
    }
    if (actual.trim() && toNumberOrNull(actual) === null) {
      toast.error("Actual cost must be a number of 0 or more");
      return;
    }
    setSaving(true);
    const { error } = await updatePartsOfficeFields(part.id, {
      quoted_cost: toNumberOrNull(quoted),
      actual_cost: toNumberOrNull(actual),
      expected_delivery_date: eta || null,
      quote_reference: quoteRef,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save part details", { description: error.message });
      return;
    }
    toast.success("Part details saved");
    onSaved();
    onClose();
  };

  const notify = async (method: NotifiedMethod) => {
    setNotifying(method);
    const { error } = await markCustomerNotified(part.id, method);
    setNotifying(null);
    if (error) {
      toast.error("Couldn't record that", { description: error.message });
      return;
    }
    toast.success(`Recorded — customer told by ${NOTIFIED_METHOD_LABEL[method]}`);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={() => !saving && onClose()}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Part tracking details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-xs text-muted-foreground">
            {part?.description}
            {part?.quantity > 1 ? ` · ×${part.quantity}` : ""}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="part-quoted-cost" className="text-xs font-semibold">
                Quoted cost (€)
              </Label>
              <Input
                id="part-quoted-cost"
                inputMode="decimal"
                placeholder="0.00"
                value={quoted}
                onChange={(e) => setQuoted(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-actual-cost" className="text-xs font-semibold">
                Actual cost (€)
              </Label>
              <Input
                id="part-actual-cost"
                inputMode="decimal"
                placeholder="0.00"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Supplier cost, for internal tracking only — this never changes what the customer is
            charged.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="part-eta" className="text-xs font-semibold">
              Expected delivery
            </Label>
            {/* Native date input — popover calendars are unreliable on iOS forms. */}
            <Input id="part-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="part-quote-ref" className="text-xs font-semibold">
              Quote reference
            </Label>
            <Input
              id="part-quote-ref"
              placeholder="e.g. Q-2026-0114"
              value={quoteRef}
              onChange={(e) => setQuoteRef(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 pt-1 border-t border-border">
            <Label className="text-xs font-semibold">Customer told about this part</Label>
            {part?.customer_notified_at ? (
              <p className="text-xs text-emerald-600 font-semibold">
                Already recorded
                {part.customer_notified_method
                  ? ` — ${NOTIFIED_METHOD_LABEL[part.customer_notified_method as NotifiedMethod]}`
                  : ""}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(["phone", "in_person", "email"] as NotifiedMethod[]).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-[11px]"
                    disabled={!!notifying}
                    onClick={() => notify(m)}
                  >
                    {notifying === m ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <BellRing className="w-3 h-3" strokeWidth={2.5} />
                    )}
                    {NOTIFIED_METHOD_LABEL[m]}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              WhatsApp is recorded automatically when you use "Tell customer".
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2 font-bold">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PartTrackingEditSheet;
