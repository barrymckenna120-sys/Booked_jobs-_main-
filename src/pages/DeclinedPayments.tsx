import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgId } from "@/hooks/useOrgId";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, CreditCard, Loader2, Phone, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { formatWhatsApp } from "@/lib/whatsappLink";

const DECLINED_STATUSES = ["FAILED", "EXPIRED", "CANCELLED", "CANCELED"];

const STATUS_BADGE: Record<string, string> = {
  FAILED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  CANCELLED: "bg-muted text-muted-foreground",
  CANCELED: "bg-muted text-muted-foreground",
};

interface DeclinedRow {
  id: string;
  checkout_id: string | null;
  status: string | null;
  updated_at: string | null;
  service_calls: {
    id: string;
    job_reference: string | null;
    balance_due: number | null;
    deposit_amount: number | null;
    deposit_required: boolean | null;
    customers: { id: string; name: string | null; phone: string | null } | null;
  } | null;
}

const sel = (s: string): string => s;

const DeclinedPayments = () => {
  const { user } = useAuth();
  const { canAccessOffice } = useUserRole(user);
  const { ready } = useOrgId();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["declined-payments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_checkout_attempts")
        .select(
          sel(
            "id, checkout_id, status, updated_at, service_calls!inner(id, job_reference, balance_due, deposit_amount, deposit_required, customers!inner(id, name, phone))",
          ),
        )
        .in("status", DECLINED_STATUSES)
        .order("updated_at", { ascending: false })
        .returns<DeclinedRow[]>();
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && ready && canAccessOffice,
  });

  const amountDue = (r: DeclinedRow) => {
    const job = r.service_calls;
    if (!job) return null;
    const value = job.deposit_required ? job.deposit_amount : job.balance_due;
    return value === null || value === undefined ? null : Number(value);
  };

  const filtered = (rows as DeclinedRow[]).filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (r.service_calls?.customers?.name || "").toLowerCase().includes(s) ||
      (r.service_calls?.job_reference || "").toLowerCase().includes(s)
    );
  });

  if (!canAccessOffice) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            You don't have access to declined payments.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer or job reference…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-2">
            <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No declined payments</p>
            <p className="text-xs text-muted-foreground/70">
              Failed, expired and cancelled card payments will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Job Ref</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Amount due</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Failed at</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Contact</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const job = r.service_calls;
                  const customer = job?.customers;
                  const due = amountDue(r);
                  const status = (r.status || "").toUpperCase();
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => job?.id && navigate(`/jobs/${job.id}`)}
                    >
                      <td className="px-4 py-3 font-bold text-foreground">{customer?.name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{job?.job_reference || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {due === null ? <span className="text-muted-foreground/50">—</span> : `€${due.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            STATUS_BADGE[status] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {status || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground font-mono tabular-nums">
                        {r.updated_at ? format(new Date(r.updated_at), "dd MMM HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {customer?.phone ? (
                          <div
                            className="flex items-center justify-center gap-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a
                              href={`tel:${customer.phone}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                            >
                              <Phone className="w-4 h-4" /> Call
                            </a>
                            <a
                              href={`https://wa.me/${formatWhatsApp(customer.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"
                            >
                              <MessageCircle className="w-4 h-4" /> WhatsApp
                            </a>
                          </div>
                        ) : (
                          <span className="block text-center text-muted-foreground/30">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DeclinedPayments;
