import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TourCloseButtonProps {
  onClose: () => void;
  className?: string;
}

const TourCloseButton = ({ onClose, className }: TourCloseButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onClick={onClose}
    aria-label="Exit tour"
    className={cn("h-11 w-11 shrink-0 rounded-full bg-background/95 shadow-sm hover:bg-muted", className)}
  >
    <X className="h-5 w-5" aria-hidden="true" />
  </Button>
);

export default TourCloseButton;