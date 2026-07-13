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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";

type Row = {
  user_id: string;
  email: string | null;
  name: string;
  role: string;
  organisation_id: string | null;
  organisation_name: string | null;
  last_sign_in_at: string | null;
  created_at: string;
};

const UserActivityOverview = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string>("__all__");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // oldest first

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("list-users", {
        body: { scope: "all_orgs" },
      });
      if (cancelled) return;
      if (error) {
        setError(error.message ?? "Failed to load users");
        setLoading(false);
        return;
      }
      setRows((data?.users as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tenants = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.organisation_name) set.set(r.organisation_name, r.organisation_name);
    }
    return Array.from(set.keys()).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const base =
      tenantFilter === "__all__"
        ? rows
        : rows.filter((r) => (r.organisation_name ?? "") === tenantFilter);
    const sorted = [...base].sort((a, b) => {
      const av = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : null;
      const bv = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : null;
      // Nulls ("Never") always float to the top of the "stale" end.
      if (av === null && bv === null) return 0;
      if (av === null) return sortDir === "asc" ? -1 : 1;
      if (bv === null) return sortDir === "asc" ? 1 : -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [rows, tenantFilter, sortDir]);

  const fmt = (iso: string | null) => {
    if (!iso) return "Never";
    try {
      return format(new Date(iso), "dd MMM yyyy HH:mm");
    } catch {
      return "—";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Activity — Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tenant</span>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="All tenants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All tenants</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} user${filtered.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    >
                      Last Login
                      {sortDir === "asc" ? (
                        <ArrowUp className="ml-1 h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="ml-1 h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.email ?? "—"}</TableCell>
                    <TableCell>{r.name || "—"}</TableCell>
                    <TableCell>{r.organisation_name ?? "—"}</TableCell>
                    <TableCell>{r.role || "—"}</TableCell>
                    <TableCell className={r.last_sign_in_at ? "" : "text-muted-foreground"}>
                      {fmt(r.last_sign_in_at)}
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
};

export default UserActivityOverview;
