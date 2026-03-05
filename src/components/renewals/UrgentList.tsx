import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Send, ArrowRight, MessageCircle } from "lucide-react";
import { format } from "date-fns";

type UrgentCustomer = {
  id: string;
  name: string;
  phone: string;
  next_service_due: string;
  daysUntil: number;
  renewal_stage: string | null;
};

type Props = {
  customers: UrgentCustomer[];
  onSendReminder: (customer: UrgentCustomer) => void;
  onArchive?: (customer: UrgentCustomer) => void;
  onSendAll: () => void;
  needReminderCount: number;
};

const UrgentList = ({ customers, onSendReminder, onArchive, onSendAll, needReminderCount }: Props) => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? customers : customers.slice(0, 5);

  if (customers.length === 0) return null;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h3 className="text-sm font-bold text-foreground">Urgent — Due This Week</h3>
          <span className="text-[10px] font-bold bg-destructive/10 text-destructive rounded-full px-2 py-0.5 ml-auto">
            {customers.length}
          </span>
        </div>

        <div className="space-y-0">
          {visible.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 py-2.5 px-2 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-foreground truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Due {format(new Date(c.next_service_due), "d MMM")}
                  {c.daysUntil < 0 && (
                    <span className="text-destructive font-bold ml-1.5">
                      {Math.abs(c.daysUntil)}d overdue
                    </span>
                  )}
                  {c.daysUntil === 0 && <span className="text-destructive font-bold ml-1.5">Today</span>}
                  {c.daysUntil > 0 && <span className="text-warning font-semibold ml-1.5">{c.daysUntil}d</span>}
                </div>
              </div>
              {c.renewal_stage === "not_contacted" || !c.renewal_stage ? (
                <button
                  onClick={() => onSendReminder(c)}
                  className="shrink-0 px-2.5 py-1 rounded-lg border-[1.5px] border-[#25D366] bg-success/5 text-success text-[11px] font-bold hover:bg-success/10 transition-colors flex items-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" /> Remind
                </button>
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground/60">Sent</span>
              )}
              {onArchive && (
                <button
                  onClick={() => onArchive(c)}
                  className="shrink-0 px-2 py-1 rounded-lg border border-border text-muted-foreground/60 text-[11px] font-medium hover:bg-muted/50 hover:text-muted-foreground transition-colors flex items-center gap-1"
                  title="Archive"
                >
                  <Archive className="w-3 h-3" /> Archive
                </button>
              )}
            </div>
          ))}
        </div>

        {customers.length > 5 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-xs text-primary font-bold py-2 mt-1 hover:underline"
          >
            Show more ({customers.length - 5} more)
          </button>
        )}

        <div className="flex gap-2 mt-4">
          {needReminderCount > 0 && (
            <Button
              onClick={onSendAll}
              className="flex-1 bg-success hover:bg-success/90 text-white font-bold text-xs gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Send All Reminders ({needReminderCount})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/renewals")}
            className="text-xs font-bold gap-1"
          >
            Renewals <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UrgentList;
