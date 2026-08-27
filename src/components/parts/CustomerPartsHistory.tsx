import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PartStatusIcon from "@/components/parts/PartStatusIcon";
import PartStatusTrail from "@/components/parts/PartStatusTrail";
import PartTrackingDetails from "@/components/parts/PartTrackingDetails";

import { PART_PRIORITY_CONFIG, PART_STATUS_CONFIG, priorityRank } from "@/lib/partsStatus";

/**
 * BJ-0070 — permanent parts record on the customer file.
 *
 * Reads parts_requests directly (rather than relying on activity entries) so
 * every part ever ordered for this customer is visible with its full detail and
 * status trail, including parts that predate activity logging.
 */
interface Props {
  customerId: string;
  onCountReady?: (count: number) => void;
}

const CustomerPartsHistory = ({ customerId, onCountReady }: Props) => {
  const navigate = useNavigate();

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ["customer-parts-history", customerId],
    queryFn: async () => {
      // Parts logged against one of this customer's jobs but without a direct
      // customer link must still show — collect those job ids first.
      const { data: jobs } = await supabase
        .from("service_calls")
        .select("id, job_reference")
        .eq("customer_id", customerId);
      const jobIds = ((jobs as any[]) || []).map((j) => j.id);
      const refById: Record<string, string> = {};
      ((jobs as any[]) || []).forEach((j) => {
        if (j.job_reference) refById[j.id] = j.job_reference;
      });

      const filters = [`customer_id.eq.${customerId}`];
      if (jobIds.length > 0) filters.push(`service_call_id.in.(${jobIds.join(",")})`);

      const { data } = await supabase
        .from("parts_requests" as any)
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false });

      return ((data as any[]) || []).map((p) => ({
        ...p,
        job_reference: p.service_call_id ? refById[p.service_call_id] ?? null : null,
      }));
    },
    enabled: !!customerId,
  });

  useEffect(() => {
    onCountReady?.(parts.length);
  }, [parts.length, onCountReady]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (parts.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No parts ordered for this customer</p>;
  }

  const sorted = [...parts].sort((a, b) => {
    const aTerminal = a.status === "Cancelled";
    const bTerminal = b.status === "Cancelled";
    if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
    if (!aTerminal) return priorityRank(a.priority) - priorityRank(b.priority);
    return 0;
  });

  return (
    <div className="space-y-2">
      {sorted.map((part) => {
        const sCfg = PART_STATUS_CONFIG[part.status] || PART_STATUS_CONFIG.Open;
        const pCfg = PART_PRIORITY_CONFIG[(part.priority ?? "").toLowerCase()];
        return (
          <div key={part.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  <Package className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
                  {part.quantity > 1 ? `${part.quantity} × ` : ""}
                  {part.description}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                  {part.service_call_id ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/jobs/${part.service_call_id}`)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {part.job_reference || "View job"}
                    </button>
                  ) : (
                    <span>No job linked</span>
                  )}
                  {part.logged_by_name && <span>· Logged by {part.logged_by_name}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sCfg.bg} ${sCfg.text}`}
                >
                  <PartStatusIcon status={part.status} className="w-3 h-3" strokeWidth={2.5} />
                  {sCfg.label}
                </span>
                {pCfg && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pCfg.bg} ${pCfg.text}`}>
                    {pCfg.emoji} {pCfg.label}
                  </span>
                )}
              </div>
            </div>

            <PartStatusTrail row={part} className="pt-1 border-t border-border/60" />

            {/* BJ-0071 / BJ-0072 — cost, ETA, customer-told and quote reference. */}
            <PartTrackingDetails row={part} />

            {part.notes && (
              <p className="text-[12px] text-foreground/80 bg-secondary rounded-md px-2 py-1.5 leading-snug">{part.notes}</p>
            )}

          </div>
        );
      })}
    </div>
  );
};

export default CustomerPartsHistory;
