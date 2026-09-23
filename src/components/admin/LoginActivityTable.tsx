/**
 * Login Activity — superadmin-only view of auth_activity_events.
 *
 * Read-only. RLS already restricts the table to superadmins; this screen just
 * makes it readable: tenant picker, result filter, email/IP search, newest
 * first. Opening it records one access-log row (who looked, with what filter).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";

const PAGE_SIZE = 50;

type EventRow = {
  id: string;
  created_at: string;
  event_type: string;
  outcome: string;
  failure_reason: string | null;
  email: string | null;
  organisation_id: string | null;
  ip: string | null;
  ip_truncated: boolean;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  device_type: string | null;
  display_mode: string | null;
};

type Org = { id: string; name: string | null };

export const EVENT_LABELS: Record<string, string> = {
  sign_in_success: "Signed in",
  sign_in_failed: "Sign-in failed",
  sign_out: "Signed out",
  password_reset_requested: "Password reset requested",
  password_changed: "Password changed",
  account_locked: "Account locked",
};

export const REASON_LABELS: Record<string, string> = {
  invalid_credentials: "Wrong email or password",
  network_error: "Network failure",
  account_blocked: "Account blocked",
  account_locked: "Account locked",
  email_not_confirmed: "Email not confirmed",
  rate_limited: "Too many attempts",
  "5_failed_attempts": "5 failed attempts",
  other: "Other",
};

/** DD/MM/YY HH:MM in the browser's locale-independent form. */
export function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

/** "Safari 18 · iOS · Mobile · Installed app" — skips whatever is missing. */
export function formatDevice(row: {
  browser?: string | null;
  browser_version?: string | null;
  os?: string | null;
  device_type?: string | null;
  display_mode?: string | null;
}): string {
  const parts: string[] = [];
  if (row.browser) parts.push([row.browser, row.browser_version].filter(Boolean).join(" "));
  if (row.os) parts.push(row.os);
  if (row.device_type) parts.push(row.device_type);
  if (row.display_mode === "standalone") parts.push("Installed app");
  return parts.length ? parts.join(" · ") : "—";
}

const LoginActivityTable = () => {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [resultFilter, setResultFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("organisations")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setOrgs((data as Org[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("auth_activity_events")
      .select(
        "id, created_at, event_type, outcome, failure_reason, email, organisation_id, ip, ip_truncated, browser, browser_version, os, device_type, display_mode"
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (orgFilter !== "all") query = query.eq("organisation_id", orgFilter);
    if (resultFilter !== "all") query = query.eq("outcome", resultFilter);

    const term = search.trim();
    if (term) query = query.or(`email.ilike.%${term}%,ip::text.ilike.%${term}%`);

    const { data, error: qErr } = await query;
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data as EventRow[]) ?? []);
    }
    setLoading(false);
  }, [orgFilter, resultFilter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reading this screen is itself recorded.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id;
      if (cancelled || !uid) return;
      void supabase
        .from("auth_activity_access_log")
        .insert({
          viewer_user_id: uid,
          filter_organisation_id: orgFilter === "all" ? null : orgFilter,
          filters: { result: resultFilter, search: search.trim() ? "yes" : "no" },
        })
        .then(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // Records one row per tenant-filter change, not per keystroke.
  }, [orgFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const orgName = useMemo(() => {
    const map = new Map<string, string>();
    orgs.forEach((o) => map.set(o.id, o.name ?? "Unnamed company"));
    return map;
  }, [orgs]);

  const resultBadge = (row: EventRow) => {
    const failed = row.outcome === "failure";
    const reason = row.failure_reason
      ? REASON_LABELS[row.failure_reason] ?? row.failure_reason
      : null;
    return (
      <div className="space-y-1">
        <Badge
          className={
            failed
              ? "bg-rose-100 text-rose-700 hover:bg-rose-100"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
          }
        >
          {failed ? "Failed" : "Success"}
        </Badge>
        <div className="text-xs text-muted-foreground">
          {EVENT_LABELS[row.event_type] ?? row.event_type}
          {reason ? ` — ${reason}` : ""}
        </div>
      </div>
    );
  };

  const ipCell = (row: EventRow) => (
    <span className="font-mono text-xs">
      {row.ip ?? "—"}
      {row.ip_truncated && row.ip ? (
        <span className="ml-1 text-muted-foreground">(shortened)</span>
      ) : null}
    </span>
  );

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Login Activity
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3 w-3" />
            )}
            Refresh
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Select
            value={orgFilter}
            onValueChange={(v) => {
              setPage(0);
              setOrgFilter(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name ?? "Unnamed company"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={resultFilter}
            onValueChange={(v) => {
              setPage(0);
              setResultFilter(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All results" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">Successful only</SelectItem>
              <SelectItem value="failure">Failed only</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
              placeholder="Search email or IP"
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No login activity for these filters yet.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>IP address</TableHead>
                    <TableHead>Device</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatEventTime(row.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">{row.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {row.organisation_id
                          ? orgName.get(row.organisation_id) ?? "Unknown tenant"
                          : "Unknown tenant"}
                      </TableCell>
                      <TableCell>{resultBadge(row)}</TableCell>
                      <TableCell>{ipCell(row)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDevice(row)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{row.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.organisation_id
                          ? orgName.get(row.organisation_id) ?? "Unknown tenant"
                          : "Unknown tenant"}
                      </div>
                    </div>
                    {resultBadge(row)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatEventTime(row.created_at)}
                  </div>
                  <div>{ipCell(row)}</div>
                  <div className="text-xs text-muted-foreground">{formatDevice(row)}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length < PAGE_SIZE}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}

        <p className="pt-2 text-xs text-muted-foreground">
          Superadmin only. Full IP addresses are kept for 90 days, then shortened; events are
          deleted after 12 months.
        </p>
      </CardContent>
    </Card>
  );
};

export default LoginActivityTable;
