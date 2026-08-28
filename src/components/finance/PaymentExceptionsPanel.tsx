import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw, ChevronRight } from "lucide-react";
import {
  exceptionReasons,
  REASON_LABELS,
  type ReconciliationCandidate,
} from "@/lib/paymentReconciliation";

const eur = (n: number) =>
  n.toLocaleString("en-IE", { style: "currency", currency: "EUR" });

interface ExceptionRow extends ReconciliationCandidate {
  service_call_id: string;
  job_reference: string | null;
  receipt_sent: boolean | null;
  paid_at: string | null;
}

/**
 * Read-only payment reconciliation report.
 *
 * Surfaces jobs whose recorded payment status disagrees with the `job_payments`
 * ledger, so a job that was paid but left unpaid (and therefore never sent a
 * receipt) is visible instead of silent. This panel performs no writes and does
 * not correct payment state — it reports. The database view it reads is scoped
 * to the caller's own organisation.
 */
const PaymentExceptionsPanel = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAccessOffice, loading: roleLoading } = useUserRole(user);

  const enabled = !roleLoading && canAccessOffice;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["payment-reconciliation-exceptions"],
    enabled,
    queryFn: async (): Promise<ExceptionRow[]> => {
      const { data, error } = await supabase
        .from("payment_reconciliation_exceptions")
        .select("*")
        .order("job_reference", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ExceptionRow[];
    },
  });

  // Financial data is office/admin only — gate the render, not just the styling.
  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking payment records…
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-l-4 border-l-destructive shadow-sm">
        <CardContent className="py-4 px-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-destructive" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-bold text-foreground">
              Couldn't check payment records
            </p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "Check your connection and try again."}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const rows = data ?? [];
  // Nothing to report is the normal case — stay out of the way entirely.
  if (rows.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-[hsl(var(--warning))] shadow-sm">
      <CardContent className="py-4 px-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
          <p className="text-sm font-extrabold text-foreground">
            Payment exceptions ({rows.length})
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          These jobs' payment records don't match the payments logged against them.
          Review them manually — nothing is changed automatically.
        </p>

        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const reasons = exceptionReasons(row);
            return (
              <li key={row.service_call_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/jobs/${row.service_call_id}`)}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg px-1 min-h-[44px]"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-bold text-foreground truncate">
                      {row.job_reference || "No job reference"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reasons.length > 0
                        ? reasons.map((r) => REASON_LABELS[r]).join(" · ")
                        : "Needs review"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      Price {eur(row.revenue ?? 0)} · Logged {eur(row.ledger_total ?? 0)} ·
                      Balance {eur(row.balance_due ?? 0)} · {row.payment_status || "no status"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

export default PaymentExceptionsPanel;
