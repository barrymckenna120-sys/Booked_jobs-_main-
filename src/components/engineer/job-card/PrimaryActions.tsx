import { useState } from "react";
import { Car, MapPin, Play, CheckCircle2, XCircle, Ban, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrimaryActionsProps {
  status: string;
  onStatusChange: (newStatus: string) => void;
  onComplete: () => void;
  onCancel: () => void;
  onNoShow?: () => void;
  onPartsNeeded?: () => void;
}

const PrimaryActions = ({ status, onStatusChange, onComplete, onCancel, onNoShow, onPartsNeeded }: PrimaryActionsProps) => {
  const [showCantComplete, setShowCantComplete] = useState(false);
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
      <div className="space-y-2 mt-1">
        <Button
          className="w-full h-[52px] text-base font-extrabold gap-2 bg-success hover:bg-success/90 text-success-foreground"
          onClick={onComplete}
        >
          <CheckCircle2 className="w-5 h-5" /> Complete
        </Button>
        {!showCantComplete ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline focus:underline w-full text-center py-1"
            onClick={() => setShowCantComplete(true)}
          >
            Can't complete this job?
          </button>
        ) : (
          <>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-[52px] text-destructive border-destructive/30 font-bold"
                onClick={onCancel}
              >
                <XCircle className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex gap-3">
              {onNoShow && (
                <Button
                  variant="outline"
                  className="flex-1 h-[44px] text-destructive border-destructive/30 font-semibold gap-1.5 text-sm"
                  onClick={onNoShow}
                >
                  <Ban className="w-4 h-4" /> No Access
                </Button>
              )}
              {onPartsNeeded && (
                <Button
                  variant="outline"
                  className="flex-1 h-[44px] text-amber-500 border-amber-500/30 font-semibold gap-1.5 text-sm"
                  onClick={onPartsNeeded}
                >
                  <Wrench className="w-4 h-4" /> Parts Needed
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  if (status === "parts_needed" || status === "parts_ordered") {
    return (
      <div className="space-y-2 mt-1">
        <Button
          className="w-full h-[52px] text-base font-extrabold gap-2 bg-success hover:bg-success/90 text-success-foreground"
          onClick={onComplete}
        >
          <CheckCircle2 className="w-5 h-5" /> Complete
        </Button>
        {!showCantComplete ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline focus:underline w-full text-center py-1"
            onClick={() => setShowCantComplete(true)}
          >
            Can't complete this job?
          </button>
        ) : (
          <>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-[52px] text-destructive border-destructive/30 font-bold"
                onClick={onCancel}
              >
                <XCircle className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex gap-3">
              {onNoShow && (
                <Button
                  variant="outline"
                  className="flex-1 h-[44px] text-destructive border-destructive/30 font-semibold gap-1.5 text-sm"
                  onClick={onNoShow}
                >
                  <Ban className="w-4 h-4" /> No Access
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
};

export default PrimaryActions;
