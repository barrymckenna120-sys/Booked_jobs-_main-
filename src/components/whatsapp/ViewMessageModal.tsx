import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

type Message = {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  message_type: string;
  message_body: string;
  sent_at: string;
  sent_by: string | null;
  status: string;
  customer_reply: string | null;
  reply_received_at: string | null;
  linked_quote_id: string | null;
};

type Props = {
  message: Message;
  open: boolean;
  onClose: () => void;
};

const typeBadgeClass = (type: string) => {
  const map: Record<string, string> = {
    "30 Day Reminder": "bg-primary/10 text-primary",
    "7 Day Reminder": "bg-warning-light text-warning",
    "Quote Sent": "bg-[hsl(263,70%,94%)] text-[hsl(263,70%,46%)]",
    "Booking Confirmation": "bg-success-light text-success",
    "Payment Request": "bg-[hsl(24,94%,93%)] text-[hsl(24,94%,46%)]",
    "Custom": "bg-muted text-muted-foreground",
  };
  return map[type] || map["Custom"];
};

const statusBadgeClass = (status: string) => {
  const map: Record<string, string> = {
    "Sent": "bg-primary/10 text-primary",
    "Confirmed": "bg-success-light text-success",
    "No Response": "bg-muted text-muted-foreground",
    "Opted Out": "bg-destructive/10 text-destructive",
    "Failed": "bg-destructive/10 text-destructive",
  };
  return map[status] || map["Sent"];
};

const ViewMessageModal = ({ message, open, onClose }: Props) => {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Message Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                className="font-semibold text-primary hover:underline"
                onClick={() => { onClose(); navigate(`/customers/${message.customer_id}`); }}
              >
                {message.customer_name || "Customer"}
              </button>
              {message.customer_phone && (
                <p className="text-sm text-muted-foreground">{message.customer_phone}</p>
              )}
            </div>
            <div className="flex gap-2">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${typeBadgeClass(message.message_type)}`}>
                {message.message_type}
              </span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusBadgeClass(message.status)}`}>
                {message.status}
              </span>
            </div>
          </div>

          <div className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap">
            {message.message_body}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Sent:</span>{" "}
              {new Date(message.sent_at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}
            </div>
            <div>
              <span className="text-muted-foreground">Sent by:</span> {message.sent_by || "—"}
            </div>
          </div>

          {message.customer_reply && (
            <div className="border-t border-border pt-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Customer Reply</p>
              <p className="text-sm">{message.customer_reply}</p>
              {message.reply_received_at && (
                <p className="text-xs text-muted-foreground">
                  Received: {new Date(message.reply_received_at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewMessageModal;
