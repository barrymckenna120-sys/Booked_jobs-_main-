import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Package, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import PartsSectionTabs from "@/components/engineer/PartsSectionTabs";
import PartRequestCard from "@/components/engineer/PartRequestCard";
import PartsNeededSheet from "@/components/engineer/PartsNeededSheet";
import { insertPartsRequest } from "@/lib/partsRequests";
import type { PartsRequestRow } from "@/lib/partsStatus";

/**
 * Read-only list of the signed-in engineer's parts requests: the ones they logged
 * themselves (engineer_id), the ones office assigned to them directly
 * (assigned_engineer_id — both hold profiles.user_id, i.e. the auth uid), and the
 * ones office logged through the New Order form, which reference the engineer via
 * assigned_to (engineers.id) instead.
 */
const EngineerParts = () => {
  const { user } = useAuth("/auth");
  const { toast } = useToast();
  const [rows, setRows] = useState<PartsRequestRow[]>([]);
  const [jobRefs, setJobRefs] = useState<Record<string, string | null>>({});
  const [customerNames, setCustomerNames] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [engineer, setEngineer] = useState<{ id: string; name: string; organisation_id: string } | null>(null);
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [savingPart, setSavingPart] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (highlightId) return; // deep-linked: keep the highlighted row in view instead
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [highlightId]);

  // Scroll the notification-linked request into view once the list has rendered.
  useEffect(() => {
    if (!highlightId || rows.length === 0) return;
    const t = setTimeout(() => {
      document
        .getElementById(`part-${highlightId}`)
        ?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }, 60);
    return () => clearTimeout(t);
  }, [highlightId, rows]);


  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // Office-created orders reference the engineer via assigned_to
      // (engineers.id), so resolve this viewer's engineers row too.
      const { data: engRow } = await supabase
        .from("engineers")
        .select("id, name, organisation_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const engineerRowId = (engRow as any)?.id as string | undefined;
      if (engRow) {
        setEngineer({ id: engRow.id, name: engRow.name, organisation_id: engRow.organisation_id });
      }

      const filters = [
        `engineer_id.eq.${user.id}`,
        `assigned_engineer_id.eq.${user.id}`,
      ];
      if (engineerRowId) filters.push(`assigned_to.eq.${engineerRowId}`);

      const { data, error } = await supabase
        .from("parts_requests" as any)
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to load parts requests:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as unknown as PartsRequestRow[];
      setRows(list);

      const jobIds = Array.from(
        new Set(list.map((r) => r.service_call_id).filter((id): id is string => !!id)),
      );
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("service_calls")
          .select("id, job_reference")
          .in("id", jobIds);
        if (!cancelled) {
          const map: Record<string, string | null> = {};
          (jobs ?? []).forEach((j: any) => {
            map[j.id] = j.job_reference ?? null;
          });
          setJobRefs(map);
        }
      } else if (!cancelled) {
        setJobRefs({});
      }

      // Rows created with a picked customer store customer_id only, so resolve
      // names for display instead of falling back to "Unknown customer".
      const customerIds = Array.from(
        new Set(list.map((r) => r.customer_id).filter((id): id is string => !!id)),
      );
      if (customerIds.length > 0) {
        const { data: custs } = await supabase
          .from("customers")
          .select("id, name")
          .in("id", customerIds);
        if (!cancelled) {
          const map: Record<string, string | null> = {};
          (custs ?? []).forEach((c: any) => {
            map[c.id] = c.name ?? null;
          });
          setCustomerNames(map);
        }
      } else if (!cancelled) {
        setCustomerNames({});
      }


      if (!cancelled) setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, reloadKey]);

  // BJ-0068: office-created orders never appeared here because the list only
  // refetched on the engineer's own actions, and this PWA screen stays mounted
  // for hours. Follow the useEngineerJobs pattern: realtime + foreground refetch.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("engineer-parts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "parts_requests" }, () => {
        setReloadKey((k) => k + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => setReloadKey((k) => k + 1);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", refresh);
    };
  }, [user?.id]);

  return (
    <>
      <PartsSectionTabs />
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-extrabold text-foreground">My Parts</div>
        <Button
          className="h-10 px-4 text-sm font-extrabold gap-2"
          onClick={() => setShowRequestSheet(true)}
        >
          <Plus className="w-4 h-4" /> Request Part
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
          <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <div className="text-lg font-extrabold text-foreground mb-1.5">No parts requests yet</div>
          <div className="text-[13px] text-muted-foreground px-6">
            Parts you log on a job — and any office orders assigned to you — will appear here.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PartRequestCard
              key={row.id}
              row={row}
              highlighted={highlightId === row.id}
              userId={user?.id ?? null}
              authorName={engineer?.name ?? null}
              onCancelled={() => setReloadKey((k) => k + 1)}
              jobReference={row.service_call_id ? jobRefs[row.service_call_id] ?? null : null}
              customerName={
                row.customer_name ??
                (row.customer_id ? customerNames[row.customer_id] ?? null : null)
              }
            />

          ))}
        </div>
      )}
      <PartsNeededSheet
        open={showRequestSheet}
        loading={savingPart}
        requireCustomer
        organisationId={engineer?.organisation_id ?? null}
        onClose={() => setShowRequestSheet(false)}
        onConfirm={async (part, selection) => {
          if (!engineer?.organisation_id || !user?.id) {
            toast({
              title: "Couldn't save part",
              description: "Your organisation could not be resolved. Please refresh and try again.",
              variant: "destructive",
            });
            return;
          }
          setSavingPart(true);
          const { error } = await insertPartsRequest({
            part,
            organisationId: engineer.organisation_id,
            serviceCallId: selection?.serviceCallId ?? null,
            customerId: selection?.customerId ?? null,
            customerName: selection?.customerId ? null : selection?.customerName ?? null,
            loggedBy: user.id,
            loggedByName: engineer?.name ?? user?.email ?? null,
            assignedTo: null,
          });
          setSavingPart(false);
          if (error) {
            toast({ title: "Couldn't save part", description: error.message, variant: "destructive" });
            return;
          }
          setShowRequestSheet(false);
          setReloadKey((k) => k + 1);
          toast({ title: "Part request logged" });
        }}
      />
    </>
  );
};

export default EngineerParts;
