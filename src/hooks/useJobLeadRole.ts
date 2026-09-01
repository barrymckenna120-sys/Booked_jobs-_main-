import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveIsLeadEngineer } from "@/lib/jobLeadRole";

/**
 * BJ-0090 — resolves whether the logged-in engineer is the Lead on a job.
 * Assists (rows in job_engineers) get read-only action bars.
 */
export const useJobLeadRole = (job: { assigned_engineer_id?: string | null; assigned_engineer?: string | null } | null | undefined) => {
  const { user } = useAuth();

  const { data: engineerId, isLoading } = useQuery({
    queryKey: ["my-engineer-id", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("engineers")
        .select("id")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      return (data as any)?.id ?? null;
    },
  });

  const isLeadEngineer = resolveIsLeadEngineer({
    engineerId: isLoading ? null : engineerId,
    assignedEngineerId: job?.assigned_engineer_id ?? null,
  });

  return {
    isLeadEngineer,
    leadName: job?.assigned_engineer || "the lead engineer",
    loading: isLoading,
  };
};
