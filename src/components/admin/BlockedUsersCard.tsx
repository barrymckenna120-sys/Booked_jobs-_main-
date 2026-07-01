import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type BlockedRow = {
  email: string;
  organisation_id: string | null;
  organisation_name: string | null;
  role: string | null;
  name: string | null;
  reasons: string[];
  blocked_at: string | null;
};

export default function BlockedUsersCard() {
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [unblockingEmail, setUnblockingEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("superadmin-unblock-user", {
        body: { action: "list_blocked" },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed to load");
      }
      setRows(((data as any)?.rows ?? []) as BlockedRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load blocked users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (email: string) => {
    setUnblockingEmail(email);
    try {
      const { data, error } = await supabase.functions.invoke("superadmin-unblock-user", {
        body: { action: "unblock", email },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Unblock failed");
      }
      const performed = ((data as any)?.performed as string[] | undefined) ?? [];
      toast.success(
        performed.length ? `Unblocked ${email} — ${performed.join(", ")}` : `${email} already active`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unblock failed");
    } finally {
      setUnblockingEmail(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Blocked Users
            {!loading && (
              <Badge variant={rows.length > 0 ? "destructive" : "secondary"}>
                {rows.length} blocked
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No blocked users across any tenant. 🎉
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.email}>
                    <TableCell className="font-medium">
                      {r.email}
                      {r.name && (
                        <div className="text-xs text-muted-foreground">{r.name}</div>
                      )}
                    </TableCell>
                    <TableCell>{r.organisation_name ?? "—"}</TableCell>
                    <TableCell>{r.role ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.reasons.map((reason) => (
                          <Badge key={reason} variant="secondary" className="text-xs">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.blocked_at
                        ? new Date(r.blocked_at).toLocaleString("en-IE")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => unblock(r.email)}
                        disabled={unblockingEmail === r.email}
                      >
                        {unblockingEmail === r.email && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Unblock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
