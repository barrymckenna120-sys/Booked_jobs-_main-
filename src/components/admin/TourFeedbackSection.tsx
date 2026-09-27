import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type Row = {
  id: string;
  organisation_id: string;
  role: string | null;
  tour_type: string;
  device: string | null;
  rating: number | null;
  clarity: boolean | null;
  comment: string | null;
  is_replay: boolean;
  created_at: string;
};

const ddmmyy = (ts: string) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};

export function summarise(rows: Row[]) {
  const scored = rows.filter((r) => !r.is_replay && typeof r.rating === "number");
  const avg = (xs: Row[]) => (xs.length ? xs.reduce((s, r) => s + (r.rating ?? 0), 0) / xs.length : null);
  const by = (t: string) => scored.filter((r) => r.tour_type === t);
  return {
    total: rows.length,
    replays: rows.filter((r) => r.is_replay).length,
    average: avg(scored),
    office: { count: by("office").length, average: avg(by("office")) },
    engineer: { count: by("engineer").length, average: avg(by("engineer")) },
  };
}

const fmtAvg = (n: number | null) => (n === null ? "—" : n.toFixed(1));

/** Superadmin-only (RLS): tour feedback across all tenants. */
const TourFeedbackSection = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fb, orgs] = await Promise.all([
        supabase
          .from("onboarding_feedback")
          .select("id, organisation_id, role, tour_type, device, rating, clarity, comment, is_replay, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("organisations").select("id, name"),
      ]);
      if (cancelled) return;
      if (fb.error) setError(fb.error.message);
      else setRows((fb.data ?? []) as unknown as Row[]);
      const map: Record<string, string> = {};
      for (const o of (orgs.data ?? []) as { id: string; name: string }[]) map[o.id] = o.name;
      setOrgNames(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const tenants = useMemo(
    () => Array.from(new Set(rows.map((r) => r.organisation_id))).sort((a, b) => (orgNames[a] ?? "").localeCompare(orgNames[b] ?? "")),
    [rows, orgNames],
  );
  const filtered = tenant === "all" ? rows : rows.filter((r) => r.organisation_id === tenant);
  const s = summarise(filtered);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Average rating</p><p className="text-2xl font-bold font-mono">{fmtAvg(s.average)}</p><p className="text-[11px] text-muted-foreground">Excludes replays</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total responses</p><p className="text-2xl font-bold font-mono">{s.total}</p><p className="text-[11px] text-muted-foreground">{s.replays} replay{s.replays === 1 ? "" : "s"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Office</p><p className="text-2xl font-bold font-mono">{fmtAvg(s.office.average)}</p><p className="text-[11px] text-muted-foreground">{s.office.count} response{s.office.count === 1 ? "" : "s"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Engineer</p><p className="text-2xl font-bold font-mono">{fmtAvg(s.engineer.average)}</p><p className="text-[11px] text-muted-foreground">{s.engineer.count} response{s.engineer.count === 1 ? "" : "s"}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Tour feedback</CardTitle>
          <Select value={tenant} onValueChange={setTenant}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All tenants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((id) => <SelectItem key={id} value={id}>{orgNames[id] ?? id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading feedback…</div>
          ) : error ? (
            <p className="py-8 text-sm text-destructive">Couldn't load feedback: {error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">No tour feedback yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Tenant</TableHead><TableHead>Role</TableHead><TableHead>Tour</TableHead>
                    <TableHead>Device</TableHead><TableHead>Rating</TableHead><TableHead>Easy to follow</TableHead><TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{ddmmyy(r.created_at)}</TableCell>
                      <TableCell className="text-sm">{orgNames[r.organisation_id] ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.role ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <span className="capitalize">{r.tour_type}</span>
                        {r.is_replay && <Badge variant="secondary" className="ml-2 text-[10px]">Replay</Badge>}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{r.device ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">{r.rating ?? "—"}★</TableCell>
                      <TableCell className="text-sm">{r.clarity === true ? "Yes" : r.clarity === false ? "No" : "—"}</TableCell>
                      <TableCell className="text-sm max-w-[320px] whitespace-pre-wrap break-words">{r.comment || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TourFeedbackSection;
