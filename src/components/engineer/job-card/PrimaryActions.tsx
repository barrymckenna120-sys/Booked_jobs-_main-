import { Car, MapPin, Play, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrimaryActionsProps {
  status: string;
  onStatusChange: (newStatus: string) => void;
  onComplete: () => void;
  onCancel: () => void;
}

const PrimaryActions = ({ status, onStatusChange, onComplete, onCancel }: PrimaryActionsProps) => {
  if (status === "Scheduled" || status === "Booked") {
    return (
      <Button className="w-full h-[52px] text-base font-extrabold gap-2 mt-1" onClick={() => onStatusChange("En Route")}>
        <Car className="w-5 h-5" /> En Route
      </Button>
    );
  }

  if (status === "En Route") {
    return (
      <Button className="w-full h-[52px] text-base font-extrabold gap-2 mt-1 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => onStatusChange("On Site")}>
        <MapPin className="w-5 h-5" /> Arrived On Site
      </Button>
    );
  }

  if (status === "On Site") {
    return (
      <Button className="w-full h-[52px] text-base font-extrabold gap-2 mt-1 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => onStatusChange("In Progress")}>
        <Play className="w-5 h-5" /> Start Work
      </Button>
    );
  }

  if (status === "In Progress") {
    return (
      <div className="flex gap-3 mt-1">
        <Button
          className="flex-[2] h-[52px] text-base font-extrabold gap-2 bg-success hover:bg-success/90 text-success-foreground"
          onClick={onComplete}
        >
          <CheckCircle2 className="w-5 h-5" /> Complete
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-[52px] text-destructive border-destructive/30 font-bold"
          onClick={onCancel}
        >
          <XCircle className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return null;
};

export default PrimaryActions;
