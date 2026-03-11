import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface UnsavedChangesModalProps {
  open: boolean;
  onGoBack: () => void;
  onDiscard: () => void;
}

const UnsavedChangesModal = ({ open, onGoBack, onDiscard }: UnsavedChangesModalProps) => (
  <Dialog open={open} onOpenChange={(o) => !o && onGoBack()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Unsaved Changes
        </DialogTitle>
        <DialogDescription className="text-sm pt-1">
          You have unsaved changes. If you leave now, your details will be lost.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
        <Button variant="ghost" onClick={onDiscard} className="order-2 sm:order-1">
          Leave anyway
        </Button>
        <Button
          onClick={onGoBack}
          className="order-1 sm:order-2"
        >
          Stay
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default UnsavedChangesModal;
