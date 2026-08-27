import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Lock } from "lucide-react";
import { format } from "date-fns";

type LockoutRow = {
  id: string;
  created_at: string;
  metadata: Record<string, any> | null;
};

const LoginEventsTable = () => {
  const [rows, setRows] = useState<LockoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("notifications")
      .select("id, created_at, metadata")
      .eq("notification_type", "user_locked_out")
      .order("created_at", { ascending: false })
      .limit(200);
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      // Dedupe: each lockout inserts one row per superadmin recipient.
      // Collapse on locked_user_id + minute of created_at.
      const seen = new Set<string>();
      const dedup: LockoutRow[] = [];
      for (const r of (data as LockoutRow[]) ?? []) {
        const key = `${(r.metadata as any)?.locked_user_id ?? "?"}|${r.created_at.slice(0, 16)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(r);
      }
      setRows(dedup);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const fmt = (iso: string) => {
    try {
      return format(new Date(iso), "dd MMM yyyy HH:mm");
    } catch {
      return "—";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-destructive" />
          Login Events — Account Lockouts
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Refresh
        </Button>
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
            No lockout events yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const m = r.metadata ?? {};
                  const email = m.locked_user_email ?? "—";
                  const name = m.locked_user_name;
                  const org = m.organisation_name ?? "Unknown tenant";
                  const reason =
                    m.reason === "5_failed_attempts"
                      ? "5 failed login attempts (1h auto-lock)"
                      : m.reason ?? "—";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{email}</div>
                        {name && (
                          <div className="text-xs text-muted-foreground">{name}</div>
                        )}
                      </TableCell>
                      <TableCell>{org}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {reason}
                      </TableCell>
                      <TableCell>{fmt(r.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LoginEventsTable;
