import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, DatabaseBackup } from "lucide-react";
import { formatDublin, formatMB, formatDuration, hasActive } from "./restoreFormat";

type RestorePoint = {
  id: string;
  stamp: string;
  bytes: number;
  created_at: string;
  counts: Record<string, number> | null;
};

type ReportRow = {
  table: string;
  status?: string;
  in_backup?: number;
  in_live?: number;
  missing_from_live?: number;
  changed?: number;
  added_since?: number;
  planned?: number;
  inserted?: number;
  skipped_gdpr?: number;
  skipped_orphan?: number;
};

type RestoreRow = {
  id: string;
  backup_stamp: string;
  mode: string;
  status: string;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  report: { tables?: ReportRow[]; report_only?: ReportRow[] } | null;
  error: string | null;
};

const STATUS_CLASS: Record<string, string> = {
  queued: "bg-slate-200 text-slate-600 border-slate-200",
  running: "bg-blue-100 text-blue-700 border-blue-100",
  succeeded: "bg-emerald-100 text-emerald-700 border-emerald-100",
  failed: "bg-rose-100 text-rose-700 border-rose-100",
};

const n = (v: number | undefined | null) => (v == null ? "—" : String(v));

const RECOVER_WINDOW_MS = 30 * 60 * 1000;

function totalMissing(row: RestoreRow): number {
  return (row.report?.tables ?? []).reduce(
    (sum, t) => sum + (typeof t.missing_from_live === "number" ? t.missing_from_live : 0),
    0,
  );
}

function canRecover(row: RestoreRow): boolean {
  if (row.mode !== "dry_run" || row.status !== "succeeded" || !row.finished_at) return false;
  const t = Date.parse(row.finished_at);
  if (!Number.isFinite(t) || Date.now() - t > RECOVER_WINDOW_MS) return false;
  return totalMissing(row) > 0;
}

function statusLabel(row: RestoreRow): string {
  return row.mode === "recover_missing" && row.status === "succeeded" ? "recovered" : row.status;
}

async function errorText(error: any): Promise<{ status?: number; message: string }> {
  const ctx = error?.context;
  const status = ctx?.status ?? ctx?.response?.status;
  try {
    const res = ctx?.json ? ctx : ctx?.response;
    const body = res ? await res.clone().json() : null;
    if (body?.error) return { status, message: String(body.error) };
  } catch (_e) {
    /* fall through */
  }
  return { status, message: error?.message || "Request failed" };
}

export default function BackupsRestoreCard({ orgId, orgName }: { orgId: string; orgName?: string | null }) {
  const [points, setPoints] = useState<RestorePoint[] | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [history, setHistory] = useState<RestoreRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recoverTarget, setRecoverTarget] = useState<RestoreRow | null>(null);

  const loadPoints = useCallback(async () => {
    const since = new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("backup_run_tenants")
      .select("counts, backup_runs!inner(id, stamp, bytes, created_at)")
      .eq("organisation_id", orgId)
      .gte("backup_runs.created_at", since);
    if (error) {
      setPointsError(error.message);
      return;
    }
    setPointsError(null);
    const rows: RestorePoint[] = (data ?? []).map((r: any) => ({
      id: r.backup_runs.id,
      stamp: r.backup_runs.stamp,
      bytes: r.backup_runs.bytes,
      created_at: r.backup_runs.created_at,
      counts: r.counts,
    }));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setPoints(rows);
  }, [orgId]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("tenant_restores")
      .select("*")
      .eq("organisation_id", orgId)
      .order("requested_at", { ascending: false });
    if (error) {
      setHistoryError(error.message);
      return;
    }
    setHistoryError(null);
    setHistory((data ?? []) as unknown as RestoreRow[]);
  }, [orgId]);

  useEffect(() => {
    loadPoints();
    loadHistory();
  }, [loadPoints, loadHistory]);

  const active = history ? hasActive(history) : false;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(loadHistory, 10000);
    return () => clearInterval(t);
  }, [active, loadHistory]);

  const startDryRun = async (stamp: string) => {
    setStarting(stamp);
    try {
      const { error } = await supabase.functions.invoke("trigger-tenant-restore", {
        body: { organisation_id: orgId, backup_stamp: stamp, mode: "dry_run" },
      });
      if (error) {
        const { status, message } = await errorText(error);
        toast.error(status === 409 ? "A restore is already running for this tenant" : message);
      } else {
        toast.success("Dry run started");
      }
    } finally {
      setStarting(null);
      loadHistory();
    }
  };

  const startRecover = async (row: RestoreRow) => {
    setStarting(row.id);
    try {
      const { error } = await supabase.functions.invoke("trigger-tenant-restore", {
        body: {
          organisation_id: orgId,
          backup_stamp: row.backup_stamp,
          mode: "recover_missing",
          dry_run_id: row.id,
          confirm: true,
        },
      });
      if (error) {
        const { status, message } = await errorText(error);
        toast.error(status === 409 ? "A restore is already running for this tenant" : message);
      } else {
        toast.success("Recovery started");
      }
    } finally {
      setStarting(null);
      loadHistory();
    }
  };

  const countsCells = (c: Record<string, number> | null) => [
    ["Customers", c?.customers],
    ["Jobs", c?.service_calls],
    ["Quotes", c?.quotes],
    ["Payments", c?.job_payments],
  ] as const;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Backups &amp; Restore</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* A. Restore points */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Restore points (last 35 days)</h3>
          {pointsError ? (
            <p className="text-sm text-destructive">Could not load restore points: {pointsError}</p>
          ) : points === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : points.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No restore points yet — the nightly backup creates one each night
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/time</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                      <TableHead className="text-right">Jobs</TableHead>
                      <TableHead className="text-right">Quotes</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {points.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{formatDublin(p.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatMB(p.bytes)}</TableCell>
                        {countsCells(p.counts).map(([k, v]) => (
                          <TableCell key={k} className="text-right font-mono text-xs">{n(v)}</TableCell>
                        ))}
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={starting !== null}
                            onClick={() => startDryRun(p.stamp)}>
                            {starting === p.stamp ? "Starting…" : "Check (dry run)"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 md:hidden">
                {points.map((p) => (
                  <div key={p.id} className="rounded-xl border p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono">{formatDublin(p.created_at)}</span>
                      <span className="font-mono text-muted-foreground">{formatMB(p.bytes)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      {countsCells(p.counts).map(([k, v]) => (
                        <div key={k}>
                          <div className="text-muted-foreground">{k}</div>
                          <div className="font-mono">{n(v)}</div>
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="w-full" disabled={starting !== null}
                      onClick={() => startDryRun(p.stamp)}>
                      {starting === p.stamp ? "Starting…" : "Check (dry run)"}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* B. Restore history */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Restore history</h3>
          {historyError ? (
            <p className="text-sm text-destructive">Could not load restore history: {historyError}</p>
          ) : history === null ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dry runs yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((r) => {
                const open = expanded === r.id;
                return (
                  <div key={r.id} className="rounded-xl border">
                    <button type="button" onClick={() => setExpanded(open ? null : r.id)}
                      className="flex w-full flex-col gap-1 p-3 text-left text-sm md:flex-row md:items-center md:gap-4">
                      <span className="flex items-center gap-1 font-mono text-xs">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {formatDublin(r.requested_at)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{r.backup_stamp}</span>
                      <span className="text-xs">{r.mode}</span>
                      <Badge variant="outline" className={STATUS_CLASS[r.status] ?? ""}>{statusLabel(r)}</Badge>
                      <span className="font-mono text-xs text-muted-foreground md:ml-auto">
                        {formatDuration(r.started_at, r.finished_at)}
                      </span>
                    </button>
                    {canRecover(r) && (
                      <div className="flex justify-end px-3 pb-2">
                        <Button size="sm" variant="destructive" disabled={starting !== null}
                          onClick={() => setRecoverTarget(r)}>
                          Recover missing rows
                        </Button>
                      </div>
                    )}
                    {open && <ReportView row={r} />}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function ReportView({ row }: { row: RestoreRow }) {
  const tables = row.report?.tables ?? [];
  const reportOnly = row.report?.report_only ?? [];
  return (
    <div className="space-y-4 border-t p-3">
      {row.status === "failed" && row.error && (
        <p className="text-sm text-destructive">Error: {row.error}</p>
      )}
      {!row.report ? (
        <p className="text-sm text-muted-foreground">No report available yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">In backup</TableHead>
                  <TableHead className="text-right">Live now</TableHead>
                  <TableHead className="text-right">Missing from live</TableHead>
                  <TableHead className="text-right">Changed</TableHead>
                  <TableHead className="text-right">Added since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => {
                  const missing = (t.missing_from_live ?? 0) > 0;
                  return (
                    <TableRow key={t.table} className={missing ? "bg-rose-50" : ""}>
                      <TableCell className="text-xs">
                        {t.table}
                        {t.status && t.status !== "ok" && (
                          <span className="ml-1 text-muted-foreground">({t.status})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{n(t.in_backup)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{n(t.in_live)}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${missing ? "font-semibold text-rose-700" : ""}`}>
                        {n(t.missing_from_live)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{n(t.changed)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{n(t.added_since)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {reportOnly.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold">Report only (counts)</p>
              {reportOnly.map((t) => (
                <p key={t.table} className="text-xs font-mono">
                  {t.table}: backup {n(t.in_backup)} · live {n(t.in_live)}
                  {t.status && t.status !== "ok" ? ` (${t.status})` : ""}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">Job photos (Cloudinary) are not part of database backups.</p>
    </div>
  );
}
