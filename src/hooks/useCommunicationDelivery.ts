import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CommunicationDelivery } from "@/lib/deliveryStatus";

type Args = {
  /** "quote" | "invoice" | "receipt" | "service_reminder" */
  commType: string;
  /** quote id / job id / customer id — whatever the send path recorded. */
  relatedId: string | null | undefined;
  enabled?: boolean;
};

const SELECT =
  "id, comm_type, channel, delivery_status, failure_reason_public, attempt_count, last_attempt_at, recipient, related_reference";

/**
 * Reads the current delivery state for one record. RLS scopes rows to the
 * signed-in user's organisation, so no organisation_id is sent from the client.
 */
export function useCommunicationDelivery({ commType, relatedId, enabled = true }: Args) {
  const { toast } = useToast();
  const [delivery, setDelivery] = useState<CommunicationDelivery | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const load = useCallback(async () => {
    if (!relatedId || !enabled) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("communication_deliveries")
        .select(SELECT)
        .eq("comm_type", commType)
        .eq("related_id", relatedId)
        .order("last_attempt_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setDelivery((data as CommunicationDelivery) ?? null);
    } catch (e) {
      console.error("useCommunicationDelivery load failed", e);
    } finally {
      setLoading(false);
    }
  }, [commType, relatedId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = useCallback(async () => {
    if (!delivery || resending) return;
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-communication", {
        body: { delivery_id: delivery.id },
      });
      if (error) throw error;

      if (data?.success) {
        toast({ title: "Message resent" });
      } else if (data?.status === "opted_out") {
        toast({
          title: "Not sent",
          description: "This customer has opted out of messages.",
        });
      } else {
        toast({
          title: "Still not delivered",
          description: data?.reason ?? "Please check the customer's contact details.",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error("resend-communication failed", e);
      toast({
        title: "Resend failed",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
      await load();
    }
  }, [delivery, resending, toast, load]);

  return { delivery, loading, resending, resend, reload: load };
}
