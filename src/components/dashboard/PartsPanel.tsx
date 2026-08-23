import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, PackageCheck, MessageCircle, Loader2, X } from "lucide-react";
import {
  PART_PRIORITY_CONFIG,
  PART_STATUS_CONFIG,
  markCustomerNotified,
  priorityRank,
  updatePartStatus,
  type PartStatus,
} from "@/lib/partsRequests";
import PartStatusIcon from "@/components/parts/PartStatusIcon";
import PartTrackingDetails from "@/components/parts/PartTrackingDetails";


const PartsPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ["parts-panel", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parts_requests" as any)
        .select("*, service_calls(id, job_reference, scheduled_date, completed_at, follow_up_detail), customers(name, phone, address)")
        .in("status", ["Open", "Ordered", "Ready to Fit"])
        .order("created_at", { ascending: false });
      const rows = ((data as any[]) || []).slice();
      rows.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
      return rows;
    },
    enabled: !!user,
  });

  const nameOf = (p: any) => p.customers?.name || p.customer_name || "Unknown";
  const phoneOf = (p: any) => p.customers?.phone || p.customer_phone || "";
  const addressOf = (p: any) => p.customers?.address || p.customer_address || "—";

  const handleSendMessage = async (part: any) => {
    const phone = phoneOf(part);
    if (!part.service_call_id || !phone) {
      toast({ title: "Can't message", description: "This part has no linked job or phone number.", variant: "destructive" });
      return;
    }
    setSendingId(part.id);
    try {
      const { error } = await supabase.functions.invoke("send-part-arrived", {
        body: {
          job_id: part.service_call_id,
          customer_name: nameOf(part),
          customer_phone: phone,
          follow_up_detail: part.description || part.service_calls?.follow_up_detail || "",
        },
      });
      if (error) throw error;
      // BJ-0071 — record on the part that the customer was told, so the history
      // answers "has the customer been told" without guesswork.
      const { error: notifyError } = await markCustomerNotified(part.id, "whatsapp");
      if (notifyError) {
        toast({
          title: "Message sent, but not recorded on the part",
          description: notifyError.message,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["parts-panel"] });
      queryClient.invalidateQueries({ queryKey: ["parts-page-requests"] });
      toast({ title: `Message sent to ${nameOf(part)}` });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleUpdateStatus = async (partId: string, newStatus: PartStatus) => {
    setUpdatingId(partId);
    const { error } = await updatePartStatus(partId, newStatus);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: newStatus === "Cancelled" ? "Part cancelled" : `Part marked ${newStatus}` });
      queryClient.invalidateQueries({ queryKey: ["parts-panel"] });
      queryClient.invalidateQueries({ queryKey: ["parts-count"] });
      queryClient.invalidateQueries({ queryKey: ["parts-nav-count"] });
      queryClient.invalidateQueries({ queryKey: ["parts-page-requests"] });
    }
    setUpdatingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No outstanding parts 🎉
      </div>
    );
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-bold">{parts.length} Part{parts.length !== 1 ? "s" : ""}</h2>
      </div>
      {parts.map((part: any) => {
        const sCfg = PART_STATUS_CONFIG[part.status] || PART_STATUS_CONFIG.Open;
        const pCfg = PART_PRIORITY_CONFIG[part.priority];
        const jobId = part.service_call_id;
        return (
          <Card key={part.id} className="border-amber-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  {part.service_calls?.job_reference && (
                    <p className="text-xs font-bold text-primary">{part.service_calls.job_reference}</p>
                  )}
                  <button
                    className="font-bold text-foreground hover:text-primary transition-colors text-left"
                    onClick={() => jobId && navigate(`/jobs/${jobId}`)}
                  >
                    {nameOf(part)}
                  </button>
                  <p className="text-sm text-muted-foreground">{phoneOf(part) || "—"}</p>
                  <p className="text-sm text-muted-foreground">{addressOf(part)}</p>
                  {jobId && (
                    <button
                      className="text-xs font-medium text-left hover:underline block"
                      style={{ color: "#4A86E8" }}
                      onClick={() => navigate(`/jobs/${jobId}`)}
                    >
                      View Job →
                    </button>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sCfg.bg} ${sCfg.text}`}>
                    <PartStatusIcon status={part.status} className="w-3 h-3" strokeWidth={2.5} />
                    {sCfg.label}
                  </span>

                  {pCfg && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pCfg.bg} ${pCfg.text}`}>
                      {pCfg.emoji} {pCfg.label}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(part.service_calls?.completed_at || part.service_calls?.scheduled_date || part.created_at)}
                  </span>
                </div>
              </div>

              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                <p className="text-sm font-medium text-amber-800">
                  ⚠️ {part.quantity > 1 ? `${part.quantity} × ` : ""}{part.description}
                </p>
                {/* BJ-0071 / BJ-0072 — cost, ETA, customer-told, quote ref. */}
                <PartTrackingDetails row={part} />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {part.status === "Ready to Fit" && (
                  <Button
                    className="h-11 sm:h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm w-full sm:w-auto"
                    disabled={sendingId === part.id}
                    onClick={() => handleSendMessage(part)}
                  >
                    {sendingId === part.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                    Send Message
                  </Button>
                )}

                {part.status === "Open" && (
                  <Button
                    variant="secondary"
                    className="h-11 sm:h-9 gap-1.5 font-bold text-sm w-full sm:w-auto"
                    disabled={updatingId === part.id}
                    onClick={() => handleUpdateStatus(part.id, "Ordered")}
                  >
                    {updatingId === part.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                    Mark Ordered
                  </Button>
                )}

                {part.status === "Ordered" && (
                  <Button
                    variant="secondary"
                    className="h-11 sm:h-9 gap-1.5 font-bold text-sm w-full sm:w-auto"
                    disabled={updatingId === part.id}
                    onClick={() => handleUpdateStatus(part.id, "Ready to Fit")}
                  >
                    {updatingId === part.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                    Mark Ready to Fit
                  </Button>
                )}

                {part.status !== "Ready to Fit" && (
                  <Button
                    variant="ghost"
                    className="h-11 sm:h-9 gap-1.5 text-sm text-muted-foreground w-full sm:w-auto"
                    disabled={updatingId === part.id}
                    onClick={() => handleUpdateStatus(part.id, "Cancelled")}
                  >
                    <X className="w-4 h-4" /> Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PartsPanel;
