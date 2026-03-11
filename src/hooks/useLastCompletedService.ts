import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

interface LastServiceInfo {
  date: string;       // formatted DD/MM/YYYY
  engineerName: string;
  raw_date: string | null;
}

/**
 * Fetches the most recent completed service_call for a customer,
 * optionally excluding a specific job (e.g. the current one).
 */
export const useLastCompletedService = (customerId: string | undefined, excludeJobId?: string) => {
  return useQuery<LastServiceInfo | null>({
    queryKey: ["last-completed-service", customerId, excludeJobId],
    enabled: !!customerId,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("service_calls")
        .select("scheduled_date, assigned_engineer_id, assigned_engineer")
        .eq("customer_id", customerId!)
        .eq("status", "Completed")
        .order("scheduled_date", { ascending: false })
        .limit(1);

      if (excludeJobId) {
        query = query.neq("id", excludeJobId);
      }

      const { data, error } = await query.maybeSingle();
      if (error || !data) return null;

      // Resolve engineer name
      let engineerName = data.assigned_engineer || "—";
      if (data.assigned_engineer_id) {
        const { data: eng } = await supabase
          .from("engineers")
          .select("name")
          .eq("id", data.assigned_engineer_id)
          .maybeSingle();
        if (eng?.name) engineerName = eng.name;
      }

      const dateStr = data.scheduled_date
        ? format(parseISO(data.scheduled_date), "dd/MM/yyyy")
        : "—";

      return {
        date: dateStr,
        engineerName,
        raw_date: data.scheduled_date,
      };
    },
  });
};
