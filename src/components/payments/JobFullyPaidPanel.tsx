import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

/**
 * The single "nothing left to collect" state, shared by the engineer
 * PaymentSheet (Case B) and the office/engineer TakePaymentModal so both
 * surfaces show identical copy. Presentational only — no data access.
 */
interface Props {
  customerName?: string | null;
  /** Amount already collected; hidden when 0. */
  collected?: number;
  /** Fully-paid completion path (engineer completion flow only). */
  onCompleteOnly?: () => void;
  onClose: () => void;
  closeLabel?: string;
}

const euro = (n: number) => `€${Number(n || 0).toFixed(2)}`;

const JobFullyPaidPanel = ({ customerName, collected = 0, onCompleteOnly, onClose, closeLabel = "Close" }: Props) => (
  <>
    <div className="px-5 py-3 border-b border-border">
      <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-success" /> Payment Complete
      </div>
      {customerName && <div className="text-[13px] text-muted-foreground mt-0.5">{customerName}</div>}
    </div>
    <div className="px-5 pt-4 space-y-4">
      <div className="rounded-xl border border-success/30 bg-success/10 p-4 space-y-1">
        <div className="text-sm font-extrabold text-foreground">This job is fully paid</div>
        <div className="text-[13px] text-muted-foreground">
          No further payment can be collected here.
        </div>
        {collected > 0 && (
          <div className="flex justify-between pt-2 text-sm">
            <span className="text-muted-foreground">Amount already collected</span>
            <span className="font-extrabold text-foreground">{euro(collected)}</span>
          </div>
        )}
      </div>
      {onCompleteOnly && (
        <Button
          className="w-full h-12 text-base font-extrabold bg-success hover:bg-success/90 text-success-foreground gap-2"
          onClick={onCompleteOnly}
        >
          <CheckCircle2 className="w-5 h-5" /> Complete Job
        </Button>
      )}
      <Button className="w-full h-12 text-base font-extrabold" variant="secondary" onClick={onClose}>
        {closeLabel}
      </Button>
    </div>
  </>
);

export default JobFullyPaidPanel;
