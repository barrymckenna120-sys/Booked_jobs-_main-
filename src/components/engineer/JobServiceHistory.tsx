import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, History } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, parseISO } from "date-fns";

interface Props {
  jobId: string;
  customerId: string;
}

const JobServiceHistory = ({ jobId, customerId }: Props) => {
  const [open, setOpen] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: ["engineer-service-history", customerId, jobId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_calls")
        .select("id, scheduled_date, created_at, job_type, notes, assigned_engineer_id, assigned_engineer")
        .eq("customer_id", customerId)
        .neq("id", jobId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) throw error;

      // Fetch engineer names for any with assigned_engineer_id
      const engineerIds = [...new Set((data || []).map(d => d.assigned_engineer_id).filter(Boolean))];
      let engineerMap: Record<string, string> = {};
      if (engineerIds.length > 0) {
        const { data: engineers } = await supabase
          .from("engineers")
          .select("id, name")
          .in("id", engineerIds);
        if (engineers) {
          engineerMap = Object.fromEntries(engineers.map(e => [e.id, e.name]));
        }
      }

      return (data || []).map(s => ({
        ...s,
        engineer_name: s.assigned_engineer_id ? engineerMap[s.assigned_engineer_id] || s.assigned_engineer || "—" : s.assigned_engineer || "—",
        display_date: s.scheduled_date
          ? format(parseISO(s.scheduled_date), "dd/MM/yyyy")
          : format(parseISO(s.created_at), "dd/MM/yyyy"),
      }));
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger className="flex items-center justify-between w-full bg-muted/40 rounded-xl px-4 py-3 text-sm font-bold text-foreground">
        <span className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#4A86E8]" /> Service History
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {history.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-4">No previous service history</div>
        ) : (
          history.map((item: any, i: number) => (
            <div key={item.id} className="bg-card border border-border/60 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{item.display_date}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#4A86E8]/10 text-[#4A86E8]">{item.job_type}</span>
              </div>
              <div className="text-xs text-muted-foreground/70">{item.engineer_name}</div>
              {item.notes && (
                <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap mt-1">{item.notes}</p>
              )}
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default JobServiceHistory;
