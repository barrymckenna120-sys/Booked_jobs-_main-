import { useState } from "react";
import { AlertTriangle, Check, Clock, HelpCircle, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCommunicationDelivery } from "@/hooks/useCommunicationDelivery";
import {
  attemptOutcomeLabel,
  canResendDelivery,
  deliveryBadgeClasses,
  deliveryBadgeLabel,
  deliveryDetailLine,
  formatAttemptTime,
  shouldCheckRecipient,
} from "@/lib/deliveryStatus";

type Attempt = {
  id: string;
  attempt_number: number;
  outcome: string;
  attempted_at: string;
  recipient: string | null;
  failure_reason_public: string | null;
  trigger_source: string;
};

type Props = {
  /** "quote" | "invoice" | "receipt" | "service_reminder" | "booking_confirmation" */
  commType: string;
  relatedId: string | null | undefined;
  /** Hide the whole block when nothing has ever been sent. */
  hideWhenMissing?: boolean;
  className?: string;
};

const ICONS: Record<string, typeof Check> = {
  delivered: Check,
  sent: Check,
  failed: AlertTriangle,
  delivery_unknown: HelpCircle,
  opted_out: ShieldOff,
  accepted: Clock,
  pending: Clock,
};

/**
 * Consistent delivery status for a customer communication, with a resend action
 * for genuine failures and an attempt history. Identical on every screen and in
 * every tenant — nothing here is org-specific.
 *
 * Provider acceptance is shown as "Sending…" — never as delivered — and an
 * unconfirmed delivery is shown as "Delivery not confirmed", never as failed.
 */
const DeliveryStatusBadge = ({ commType, relatedId, hideWhenMissing = true, className }: Props) => {
  const { delivery, resending, resend } = useCommunicationDelivery({ commType, relatedId });
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  if (!delivery) {
    if (hideWhenMissing) return null;
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        Not sent
      </span>
    );
  }

  const Icon = ICONS[delivery.delivery_status] ?? Clock;
  const detail = deliveryDetailLine(delivery);
  const failed = delivery.delivery_status === "failed";
  const unknown = delivery.delivery_status === "delivery_unknown";

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && attempts === null) {
      const { data } = await supabase.rpc("get_delivery_attempts", {
        p_delivery_id: delivery.id,
      });
      setAttempts((data as Attempt[]) ?? []);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        failed
          ? "border-rose-200 bg-rose-50"
          : unknown
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              deliveryBadgeClasses(delivery.delivery_status),
            )}
          >
            <Icon className="h-3 w-3" strokeWidth={2.5} />
            {deliveryBadgeLabel(delivery.delivery_status, delivery.channel)}
          </span>

          {/* The number/address actually used — so "I never got it" is answerable. */}
          {delivery.recipient && (
            <p className="mt-1.5 break-words font-mono text-[11px] text-muted-foreground">
              Sent to: {delivery.recipient}
            </p>
          )}

          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}

          {shouldCheckRecipient(delivery.delivery_status) && (
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
              Check the customer's number before resending.
            </p>
          )}

          <button
            type="button"
            onClick={toggleHistory}
            className="mt-1 text-[11px] font-semibold text-muted-foreground underline"
          >
            {showHistory ? "Hide history" : "View history"}
          </button>
        </div>

        {canResendDelivery(delivery.delivery_status) && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-1.5 text-xs font-bold"
            disabled={resending}
            onClick={() => void resend()}
          >
            {resending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {resending ? "Resending…" : "Resend"}
          </Button>
        )}
      </div>

      {showHistory && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-2">
          {(attempts ?? []).length === 0 && (
            <li className="text-[11px] text-muted-foreground">No attempts recorded yet.</li>
          )}
          {(attempts ?? []).map((a) => (
            <li key={a.id} className="break-words text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                #{a.attempt_number} {attemptOutcomeLabel(a.outcome)}
              </span>{" "}
              · {formatAttemptTime(a.attempted_at)}
              {a.recipient ? ` · to ${a.recipient}` : ""}
              {a.trigger_source === "resend" ? " · manual resend" : ""}
              {a.failure_reason_public ? ` · ${a.failure_reason_public}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DeliveryStatusBadge;
