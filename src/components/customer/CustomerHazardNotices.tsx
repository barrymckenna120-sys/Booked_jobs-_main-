import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ExternalLink, Download } from "lucide-react";

type HazardNotice = {
  id: string;
  ref_number: string | null;
  hazard_types: string[] | null;
  created_at: string | null;
  pdf_url: string | null;
  job_id: string | null;
};

const HAZARD_LABELS: Record<string, string> = {
  A: "A",
  B: "B",
  C: "C",
};

interface Props {
  customerId: string;
  onCountReady?: (count: number) => void;
}

const CustomerHazardNotices = ({ customerId, onCountReady }: Props) => {
  const { toast } = useToast();
  const [notices, setNotices] = useState<HazardNotice[]>([]);
  const [engineers, setEngineers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("hazard_notifications")
        .select("id, ref_number, hazard_types, created_at, pdf_url, job_id")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      const items = (data || []) as HazardNotice[];
      setNotices(items);
      onCountReady?.(items.length);

      const jobIds = items.map((n) => n.job_id).filter(Boolean) as string[];
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("service_calls")
          .select("id, assigned_engineer")
          .in("id", jobIds);
        const map: Record<string, string> = {};
        (jobs || []).forEach((j: any) => {
          if (j.assigned_engineer) map[j.id] = j.assigned_engineer;
        });
        setEngineers(map);
      }

      setLoading(false);
    };
    fetchData();
  }, [customerId]);

  if (loading || notices.length === 0) return null;

  return (
    <div className="space-y-3">
      {notices.map((notice) => {
        const engineerName = notice.job_id ? engineers[notice.job_id] : null;
        const types = Array.isArray(notice.hazard_types) ? notice.hazard_types : [];

        return (
          <div
            key={notice.id}
            className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-foreground">
                    {notice.ref_number || "—"}
                  </p>
                  {types.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold"
                    >
                      {HAZARD_LABELS[t] || t}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {notice.created_at
                    ? new Date(notice.created_at).toLocaleDateString("en-IE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                  {engineerName ? ` · ${engineerName}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs font-bold"
                onClick={(e) => {
                  e.stopPropagation();
                  if (notice.pdf_url) {
                    window.open(notice.pdf_url, "_blank", "noopener,noreferrer");
                  } else {
                    toast({
                      title: "No PDF available",
                      description: "The hazard notice PDF has not been generated yet.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" /> View
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs font-bold"
                onClick={(e) => {
                  e.stopPropagation();
                  if (notice.pdf_url) {
                    const a = document.createElement("a");
                    a.href = notice.pdf_url;
                    a.download = `${notice.ref_number || "hazard-notice"}.pdf`;
                    a.target = "_blank";
                    a.click();
                  } else {
                    toast({
                      title: "No PDF available",
                      description: "The hazard notice PDF has not been generated yet.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CustomerHazardNotices;
