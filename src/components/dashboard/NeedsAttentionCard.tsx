import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Inbox, AlertTriangle, Clock, ChevronRight, CalendarClock, FileWarning } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { endOfWeek, format, startOfWeek } from "date-fns";

interface AttentionRow {
  icon: LucideIcon;
  label: string;
  count: number;
  iconColor: string;
  iconBg: string;
  path: string;
}

const NeedsAttentionCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failedOpen, setFailedOpen] = useState(false);

  // Bookings that could not become a job (RLS: own organisation, office only).
  const { data: failedIntakes = [] } = useQuery({
    queryKey: ["failed-booking-intakes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("failed_booking_intakes")
        .select("id, created_at, source_function, submission_id, error_message, payload")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const resolveFailedIntake = async (id: string) => {
    const { error } = await supabase
      .from("failed_booking_intakes")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Could not mark as handled");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["failed-booking-intakes", user?.id] });
  };

  const payloadField = (payload: unknown, keys: string[]): string => {
    if (!payload || typeof payload !== "object") return "";
    const p = payload as Record<string, unknown>;
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  // Realtime: refresh when incoming jobs change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("needs-attention-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_calls",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-attention", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const { data } = useQuery({
    queryKey: ["dashboard-attention", user?.id],
    queryFn: async () => {
      const today = new Date();
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [incomingRes, customersRes, incompleteRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("*", { count: "exact", head: true })
          .eq("source", "Tally Form")
          .eq("incoming_status", "Pending"),
        supabase
          .from("customers")
          .select("next_service_due, renewal_stage, is_archived")
          .not("next_service_due", "is", null)
          .eq("is_archived", false)
          .not("renewal_stage", "in", '("booked","paid")'),
        supabase
          .from("service_calls")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_date", weekStart)
          .lte("scheduled_date", weekEnd)
          .not("status", "in", '("Completed","Cancelled")'),
      ]);

      let overdue = 0;
      let dueSoon = 0;
      (customersRes.data || []).forEach((c: any) => {
        const daysUntil = Math.ceil(
          (new Date(c.next_service_due).getTime() - Date.now()) / 86400000
        );
        if (daysUntil < 0) overdue++;
        else if (daysUntil <= 30) dueSoon++;
      });

      return { incoming: incomingRes.count || 0, overdue, dueSoon, incomplete: incompleteRes.count || 0 };
    },
    enabled: !!user,
  });

  const rows: AttentionRow[] = [
    {
      icon: AlertTriangle,
      label: "Overdue Boiler Services",
      count: data?.overdue || 0,
      iconColor: "text-destructive",
      iconBg: "bg-destructive/10",
      path: "/renewals?status=Overdue",
    },
    {
      icon: Clock,
      label: "Due Soon",
      count: data?.dueSoon || 0,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      path: "/renewals?status=Due Soon",
    },
    {
      icon: CalendarClock,
      label: "Incomplete Jobs",
      count: data?.incomplete || 0,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      path: "/jobs?filter=incomplete",
    },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/80 shadow-sm overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-border/70">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Needs Attention
        </h3>
      </div>
      <div className="divide-y divide-border/50">
        {failedIntakes.length > 0 && (
          <button
            onClick={() => setFailedOpen(true)}
            className="w-full flex items-center gap-3.5 px-5 py-4 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <FileWarning className="w-4 h-4 text-destructive" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold font-mono text-foreground leading-none">{failedIntakes.length}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Failed Bookings</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        )}
        {rows.map((row) => (
          <button
            key={row.label}
            onClick={() => navigate(row.path)}
            className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-secondary/60 transition-colors text-left group"
          >
            <div className={`w-9 h-9 rounded-lg ${row.iconBg} flex items-center justify-center shrink-0`}>
              <row.icon className={`w-4 h-4 ${row.iconColor}`} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold font-mono text-foreground leading-none">{row.count}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{row.label}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
        <button
          onClick={() => navigate("/incoming?status=New")}
          className="w-full flex items-center gap-3.5 px-5 py-4 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Inbox className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary/80">New Incoming</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{data?.incoming || 0} job{data?.incoming === 1 ? "" : "s"} awaiting review</p>
          </div>
          <ChevronRight className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
        </button>
      </div>
      <Dialog open={failedOpen} onOpenChange={setFailedOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Failed Bookings</DialogTitle>
            <DialogDescription>
              These online bookings could not be turned into a job. Contact the customer or add the job manually, then mark it as handled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {failedIntakes.map((f: any) => {
              const name = payloadField(f.payload, ["customer_name", "name", "full_name"]);
              const phone = payloadField(f.payload, ["mobile_number", "phone", "customer_phone"]);
              const address = payloadField(f.payload, ["address", "full_address"]);
              return (
                <div key={f.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-semibold text-foreground">{name || "Name not captured"}</p>
                  {phone && <p className="text-muted-foreground font-mono">{phone}</p>}
                  {address && <p className="text-muted-foreground">{address}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(f.created_at), "dd/MM/yy HH:mm")} · {f.source_function === "tally-boiler-rebook" ? "Rebooking form" : "Booking form"}
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => resolveFailedIntake(f.id)}>
                    Mark as handled
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NeedsAttentionCard;
