import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

interface DeleteCustomerModalProps {
  open: boolean;
  customerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteCustomerModal = ({ open, customerName, onConfirm, onCancel }: DeleteCustomerModalProps) => {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === customerName.trim().toLowerCase();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setTyped(""); onCancel(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2 text-lg">
            <Trash2 className="w-5 h-5" />
            Delete Customer
          </DialogTitle>
          <DialogDescription className="text-sm pt-1">
            This will permanently delete this customer and all associated records. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs text-muted-foreground">
            Type the customer's full name to confirm
          </Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={customerName}
            autoFocus
          />
          {typed.length > 0 && !matches && (
            <p className="text-xs text-destructive">Name does not match</p>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => { setTyped(""); onCancel(); }}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches}
            onClick={() => { setTyped(""); onConfirm(); }}
            className="font-bold"
          >
            Delete Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteCustomerModal;
