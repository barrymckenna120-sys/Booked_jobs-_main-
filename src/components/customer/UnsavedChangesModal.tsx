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
          Don't forget to save!
        </DialogTitle>
        <DialogDescription className="text-sm pt-1">
          You have unsaved changes on this customer record. Press Save to keep your changes or discard them.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
        <Button variant="ghost" onClick={onDiscard} className="order-2 sm:order-1">
          Discard Changes
        </Button>
        <Button
          onClick={onGoBack}
          className="order-1 sm:order-2 bg-[#4A86E8] hover:bg-[#4A86E8]/90 text-white font-bold"
        >
          Go Back &amp; Save
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default UnsavedChangesModal;
