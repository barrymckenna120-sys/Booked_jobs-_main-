import { useNavigate } from "react-router-dom";
import { Phone, MapPin, MessageCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
  jobId: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEircode?: string;
}

const QuickActions = ({ jobId, customerPhone, customerAddress, customerEircode }: QuickActionsProps) => {
  const navigate = useNavigate();

  const openPhone = () => window.open(`tel:${customerPhone}`);
  const openWhatsApp = () => window.open(`https://wa.me/${customerPhone?.replace(/[^0-9]/g, "")}`, "_blank");
  const openNav = () =>
    window.open(
      `https://maps.google.com/?q=${encodeURIComponent((customerAddress || "") + " " + (customerEircode || "") + " Ireland")}`,
      "_blank"
    );

  return (
    <div className="flex gap-2.5 mb-3">
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
  );
};

export default QuickActions;
