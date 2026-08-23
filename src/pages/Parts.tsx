import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Package, CalendarClock, PackageCheck, X, ChevronRight, Plus } from "lucide-react";
import PartsArrivedModal from "@/components/jobs/PartsArrivedModal";
import PartStatusIcon from "@/components/parts/PartStatusIcon";
import NewPartsOrderSheet from "@/components/parts/NewPartsOrderSheet";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";

import {
  PART_PRIORITY_CONFIG,
  PART_STATUS_CONFIG,
  priorityRank,
  updatePartStatus,
  type PartStatus,
} from "@/lib/partsRequests";

import { formatPartStatusStamp, formatPartTimestamp } from "@/lib/partsDates";

const fmtDate = (iso: string | null) => formatPartTimestamp(iso) || "—";


const Parts = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [arrivedPart, setArrivedPart] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const { orgId } = useOrgId();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");



  const { data: parts = [], isLoading, refetch } = useQuery({
    queryKey: ["parts-page-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parts_requests" as any)
        .select("*, service_calls(id, job_reference, assigned_engineer, follow_up_detail), customers(name, address, phone)")
        .in("status", ["Open", "Ordered", "Ready to Fit", "Cancelled"])
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    refetchInterval: 30000,
  });

  // Narrow same-org name lookup (user_id / display_name / role only).
  const { data: directory = {} } = useQuery({
    queryKey: ["org-profile-directory"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_org_profile_directory" as any);
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach((row: any) => {
        if (row?.user_id && row?.display_name) map[row.user_id] = row.display_name;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const nameOf = (p: any) => p.customers?.name || p.customer_name || "Unknown";
  const phoneOf = (p: any) => p.customers?.phone || p.customer_phone || "";
  const engineerOf = (p: any) => p.logged_by_name || p.service_calls?.assigned_engineer || "Unassigned";
  const cancelledByOf = (p: any) =>
    (p.cancelled_by ? (directory as Record<string, string>)[p.cancelled_by] : "") || "Unknown user";



  const open = parts
    .filter((p: any) => p.status === "Open")
    .sort((a: any, b: any) => priorityRank(a.priority) - priorityRank(b.priority));
  const ordered = parts.filter((p: any) => p.status === "Ordered");
  const ready = parts.filter((p: any) => p.status === "Ready to Fit");
  const cancelled = parts.filter((p: any) => p.status === "Cancelled");
  // "Total" stays an outstanding-work count — cancelled rows are terminal and excluded,
  // matching the sidebar badge in AppLayout.
  const outstandingCount = open.length + ordered.length + ready.length;


  // Deep-linked from a parts notification: reveal the cancelled list if the
  // highlighted row lives there, then scroll it into view once rendered.
  useEffect(() => {
    if (!highlightId || parts.length === 0) return;
    const target = parts.find((p: any) => p.id === highlightId);
    if (!target) return;
    if (target.status === "Cancelled") setShowCancelled(true);
    const t = setTimeout(() => {
      document
        .getElementById(`part-${highlightId}`)
        ?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }, 60);
    return () => clearTimeout(t);
  }, [highlightId, parts]);

  // BJ-0068: engineer-logged requests only showed up on the next 30s poll —
  // subscribe to the table so the list reflects changes immediately.
  useEffect(() => {
    const channel = supabase
      .channel("office-parts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "parts_requests" }, () => {
        refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const advance = async (part: any, status: PartStatus) => {
    setBusyId(part.id);
    const { error } = await updatePartStatus(part.id, status);
    setBusyId(null);
    if (error) {
      toast({ title: "Couldn't update part", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "Cancelled" ? "Part cancelled" : `Marked ${status}` });
    refetch();
  };

  const goToJob = (part: any) => {
    if (part.service_call_id) navigate(`/jobs/${part.service_call_id}`);
  };

  const PartCard = ({ part, borderColor, children }: { part: any; borderColor: string; children?: React.ReactNode }) => {
    const pCfg = PART_PRIORITY_CONFIG[part.priority];
    const sCfg = PART_STATUS_CONFIG[part.status];
    return (
      <Card
        id={`part-${part.id}`}
        className={`border-l-4 transition-shadow ${part.service_call_id ? "cursor-pointer hover:shadow-md" : ""} ${
          highlightId === part.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
        style={{ borderLeftColor: borderColor }}
        onClick={() => goToJob(part)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {part.service_calls?.job_reference ? (
                <p className="text-xs font-bold text-primary">{part.service_calls.job_reference}</p>
              ) : (
                <p className="text-xs font-bold text-muted-foreground">No job linked</p>
              )}
              <p className="font-bold text-foreground truncate">{nameOf(part)}</p>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {part.quantity > 1 ? `${part.quantity} × ` : ""}{part.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                <span>🔧 {engineerOf(part)}</span>
                <span>📅 {fmtDate(part.created_at)}</span>
                {formatPartStatusStamp(part) && (
                  <span>
                    📦 {formatPartStatusStamp(part)!.label} {formatPartStatusStamp(part)!.value}
                  </span>
                )}
              </div>

            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {sCfg && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sCfg.bg} ${sCfg.text}`}>
                  <PartStatusIcon status={part.status} className="w-3 h-3" strokeWidth={2.5} />
                  {sCfg.label}
                </span>
              )}
              {pCfg && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pCfg.bg} ${pCfg.text}`}>
                  {pCfg.emoji} {pCfg.label}
                </span>
              )}
              {children}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="w-6 h-6 text-amber-500" />
        <h1 className="text-2xl font-extrabold text-foreground">Parts</h1>
        <span className="text-sm text-muted-foreground ml-1">{outstandingCount} total</span>
        <Button
          size="sm"
          className="ml-auto gap-1.5 bg-amber-500 hover:bg-amber-500/90 text-white font-semibold"
          onClick={() => setNewOrderOpen(true)}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> New Order
        </Button>
      </div>


      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {open.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base font-bold text-foreground">🔴 Parts Needed</span>
            <span className="text-xs text-muted-foreground">({open.length})</span>
          </div>
          <div className="space-y-2">
            {open.map((part: any) => (
              <PartCard
                key={part.id}
                part={part}
                borderColor={part.priority === "urgent" ? "#DC2626" : part.priority === "low" ? "#16A34A" : "#F59E0B"}
              >
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-[11px] h-7 px-2.5"
                    disabled={busyId === part.id}
                    onClick={(e) => { e.stopPropagation(); advance(part, "Ordered"); }}
                  >
                    <Package className="w-3 h-3" /> Mark Ordered
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[11px] h-7 px-2 text-muted-foreground"
                    disabled={busyId === part.id}
                    onClick={(e) => { e.stopPropagation(); advance(part, "Cancelled"); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </PartCard>
            ))}
          </div>
        </section>
      )}

      {ordered.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base font-bold text-foreground">📦 Parts Ordered</span>
            <span className="text-xs text-muted-foreground">({ordered.length})</span>
          </div>
          <div className="space-y-2">
            {ordered.map((part: any) => (
              <PartCard key={part.id} part={part} borderColor="#60A5FA">
                <Button
                  size="sm"
                  className="text-white font-bold gap-1 text-[11px] h-7 px-2.5"
                  style={{ backgroundColor: "#22C55E" }}
                  disabled={busyId === part.id}
                  onClick={(e) => { e.stopPropagation(); advance(part, "Ready to Fit"); }}
                >
                  <PackageCheck className="w-3 h-3" /> Part Arrived
                </Button>
              </PartCard>
            ))}
          </div>
        </section>
      )}

      {ready.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1.5 text-base font-bold text-foreground"><PackageCheck className="w-4 h-4" style={{ color: "#7C3AED" }} /> Ready to Fit</span>
            <span className="text-xs text-muted-foreground">({ready.length})</span>
          </div>
          <div className="space-y-2">
            {ready.map((part: any) => (
              <PartCard key={part.id} part={part} borderColor="#7C3AED">
                {part.service_call_id && phoneOf(part) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-[11px] h-7 px-2.5"
                    onClick={(e) => { e.stopPropagation(); setArrivedPart(part); }}
                  >
                    <CalendarClock className="w-3 h-3" /> Tell customer
                  </Button>
                )}
              </PartCard>
            ))}
          </div>
        </section>
      )}

      {cancelled.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowCancelled((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${showCancelled ? "rotate-90" : ""}`} strokeWidth={2.5} />
            <PartStatusIcon status="Cancelled" className="w-3.5 h-3.5" strokeWidth={2.5} />
            Cancelled ({cancelled.length})
          </button>
          {showCancelled && (
            <div className="mt-3 space-y-1.5">
              {cancelled.map((part: any) => (
                <div
                  key={part.id}
                  id={`part-${part.id}`}
                  onClick={() => goToJob(part)}
                  className={`rounded-lg border bg-muted/30 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${
                    highlightId === part.id ? "border-primary ring-2 ring-primary/40" : "border-border"
                  }`}
                >

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground line-through truncate">{part.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {nameOf(part)}
                        {part.service_calls?.job_reference ? ` · ${part.service_calls.job_reference}` : ""}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {cancelledByOf(part)} · {fmtDate(part.cancelled_at || part.updated_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!isLoading && parts.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No parts needed right now</p>
          <p className="text-sm mt-1">When engineers flag parts they'll appear here — or log a phoned-in order.</p>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setNewOrderOpen(true)}>
            <Plus className="w-4 h-4" strokeWidth={2.5} /> New Order
          </Button>
        </div>
      )}

      <NewPartsOrderSheet
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        organisationId={orgId}
        onCreated={() => refetch()}
      />




      {arrivedPart && (
        <PartsArrivedModal
          open={!!arrivedPart}
          onClose={() => setArrivedPart(null)}
          jobId={arrivedPart.service_call_id}
          customerName={nameOf(arrivedPart)}
          customerPhone={phoneOf(arrivedPart)}
          followUpDetail={arrivedPart.service_calls?.follow_up_detail || arrivedPart.description}
          onSent={() => {
            setArrivedPart(null);
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default Parts;
