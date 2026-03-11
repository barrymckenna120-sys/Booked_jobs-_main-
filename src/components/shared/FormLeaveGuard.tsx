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

interface FormLeaveGuardProps {
  open: boolean;
  onKeepEditing: () => void;
  onLeave: () => void;
}

const FormLeaveGuard = ({ open, onKeepEditing, onLeave }: FormLeaveGuardProps) => (
  <Dialog open={open} onOpenChange={(o) => !o && onKeepEditing()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="w-5 h-5" style={{ color: "#F59E0B" }} />
          Hold on!
        </DialogTitle>
        <DialogDescription className="text-sm pt-1">
          You haven't finished filling this in. If you leave now your changes will be lost.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
        <Button variant="ghost" onClick={onLeave} className="order-2 sm:order-1">
          Leave anyway
        </Button>
        <Button
          onClick={onKeepEditing}
          className="order-1 sm:order-2"
        >
          Keep editing
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default FormLeaveGuard;
