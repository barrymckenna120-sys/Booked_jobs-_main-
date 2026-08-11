import { useEffect, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PartsSectionTabs from "@/components/engineer/PartsSectionTabs";
import PartRequestCard from "@/components/engineer/PartRequestCard";
import type { PartsRequestRow } from "@/lib/partsStatus";

/**
 * Read-only list of the signed-in engineer's parts requests — both the ones they
 * logged themselves (engineer_id) and the ones office assigned to them
 * (assigned_engineer_id). The legacy assigned_to column (engineers.id) is not
 * queried; these two columns hold profiles.user_id, i.e. the auth uid directly.
 */
const EngineerParts = () => {
  const { user } = useAuth("/auth");
  const [rows, setRows] = useState<PartsRequestRow[]>([]);
  const [jobRefs, setJobRefs] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);


  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("parts_requests" as any)
        .select("*")
        .or(`engineer_id.eq.${user.id},assigned_engineer_id.eq.${user.id}`)
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

      if (!cancelled) setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <>
      <PartsSectionTabs />
      <div className="text-lg font-extrabold text-foreground">My Parts</div>

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
              jobReference={row.service_call_id ? jobRefs[row.service_call_id] ?? null : null}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default EngineerParts;
