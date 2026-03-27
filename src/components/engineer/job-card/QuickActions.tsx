import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Phone, MapPin, MessageCircle, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
  jobId: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEircode?: string;
}

const QuickActions = ({ jobId, customerPhone, customerAddress, customerEircode }: QuickActionsProps) => {
  const navigate = useNavigate();

  const { data: certCount = 0 } = useQuery({
    queryKey: ["cert-count", jobId],
    queryFn: async () => {
      const [certRes, hazRes] = await Promise.all([
        supabase.from("certificates").select("id", { count: "exact", head: true }).eq("job_id", jobId),
        supabase.from("hazard_notifications").select("id", { count: "exact", head: true }).eq("job_id", jobId),
      ]);
      return (certRes.count || 0) + (hazRes.count || 0);
    },
  });

  const openPhone = () => window.open(`tel:${customerPhone}`);
  const openWhatsApp = () => window.open(`https://wa.me/${customerPhone?.replace(/[^0-9]/g, "")}`, "_blank");
  const openNav = () =>
    window.open(
      `https://maps.google.com/?q=${encodeURIComponent((customerAddress || "") + " " + (customerEircode || "") + " Ireland")}`,
      "_blank"
    );

  return (
    <div className="space-y-2.5 mb-3">
      <div className="flex gap-2.5">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={openPhone}>
          <Phone className="w-3.5 h-3.5" /> Call
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11 text-success" onClick={openWhatsApp}>
          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11 text-primary" onClick={openNav}>
          <MapPin className="w-3.5 h-3.5" /> Nav
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={() => navigate(`/engineer/job/${jobId}`)}>
          <Eye className="w-3.5 h-3.5" /> Details
        </Button>
      </div>
      <Button
        size="sm"
        className="w-full gap-2 h-11 text-xs font-extrabold text-white"
        style={{ backgroundColor: "#1e3a5f" }}
        onClick={() => navigate(`/engineer/job/${jobId}/certificates`)}
      >
        <FileText className="w-4 h-4" />
        Certificates
        {certCount > 0 && (
          <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {certCount}
          </span>
        )}
      </Button>
    </div>
  );
};

export default QuickActions;
