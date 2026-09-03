import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Copy, LifeBuoy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatAppScreen } from "@/lib/supportDiagnostics";

const ROW_LIMIT = 100;

type SupportReport = {
  id: string;
  organisation_id: string;
  report_type: string;
  message: string;
  submitted_by_name: string | null;
  submitted_by_role: string | null;
  app: string | null;
  screen: string | null;
  route: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  device_type: string | null;
  viewport: string | null;
  app_version: string | null;
  is_online: boolean | null;
  user_agent: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  bug: "Bug",
  feedback: "Feedback",
  question: "Question",
};

const typeClass = (t: string) =>
  t === "bug"
    ? "bg-rose-100 text-rose-700 hover:bg-rose-100"
    : t === "feedback"
      ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
      : "bg-amber-100 text-amber-700 hover:bg-amber-100";

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
};

const truncate = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/**
 * Read-only cross-tenant support report review. Scope comes from RLS:
 * superadmins can select every organisation's rows, tenant users only their own.
 * Organisation and type filters, sort and the 100-row cap are applied in the
 * query, not in the browser.
 */
const SupportReportsTab = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<SupportReport[] | null>(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [orgFilter, setOrgFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<SupportReport | null>(null);

  // Organisation filter options (names, not UUIDs).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("organisations").select("id, name").order("name");
      if (cancelled) return;
      const opts = (data || []).map((o) => ({ id: o.id as string, name: (o.name as string) || o.id }));
      setOrgOptions(opts);
      setOrgNames((prev) => {
        const map = { ...prev };
        for (const o of opts) map[o.id] = o.name;
        return map;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReports(null);
    setLoadError(null);
    (async () => {
      let query = supabase
        .from("support_reports")
        .select("*")
        .order("created_at", { ascending: !newestFirst })
        .limit(ROW_LIMIT);
      if (orgFilter !== "all") query = query.eq("organisation_id", orgFilter);
      if (typeFilter !== "all") query = query.eq("report_type", typeFilter);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setReports([]);
        return;
      }
      setReports((data || []) as SupportReport[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgFilter, typeFilter, newestFirst]);

  const filtersActive = orgFilter !== "all" || typeFilter !== "all";
  const orgName = (id: string) => orgNames[id] || id;

  const emptyMessage = useMemo(
    () => (filtersActive ? "No reports match the current filters." : "No support reports yet."),
    [filtersActive],
  );

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast({ title: "Report ID copied" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="w-4 h-4" /> Support Reports
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All organisations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organisations</SelectItem>
              {orgOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feedback">Feedback</SelectItem>
              <SelectItem value="question">Question</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setNewestFirst((v) => !v)} className="gap-1.5">
            {newestFirst ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
            {newestFirst ? "Newest first" : "Oldest first"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <p className="text-sm text-destructive">Couldn't load support reports: {loadError}</p>
        ) : reports === null ? (
          <p className="text-sm text-muted-foreground">Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Org</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Submitted by</TableHead>
                  <TableHead>App / Screen</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setOpenReport(r)}
                  >
                    <TableCell className="font-medium">{orgName(r.organisation_id)}</TableCell>
                    <TableCell>
                      <Badge className={typeClass(r.report_type)}>
                        {TYPE_LABEL[r.report_type] ?? r.report_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>{r.submitted_by_name || "Unknown"}</div>
                      {r.submitted_by_role && (
                        <div className="text-xs text-muted-foreground">{r.submitted_by_role}</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatAppScreen(r.app, r.screen)}
                    </TableCell>
                    <TableCell className="max-w-[320px]">{truncate(r.message)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {fmtDateTime(r.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!openReport} onOpenChange={(o) => !o && setOpenReport(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report details</DialogTitle>
          </DialogHeader>
          {openReport && <ReportDetails report={openReport} orgName={orgName(openReport.organisation_id)} onCopyId={copyId} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const Row = ({ label, value }: { label: string; value: string | null | undefined }) =>
  value ? (
    <div className="flex gap-2 text-sm">
      <span className="w-[120px] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  ) : null;

const ReportDetails = ({
  report: r,
  orgName,
  onCopyId,
}: {
  report: SupportReport;
  orgName: string;
  onCopyId: (id: string) => void;
}) => (
  <div className="space-y-5">
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="w-[120px] shrink-0 text-muted-foreground">Report ID</span>
        <span className="font-mono text-xs break-all">{r.id}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCopyId(r.id)} title="Copy report ID">
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
      <Row label="Organisation" value={orgName} />
      <Row label="Type" value={TYPE_LABEL[r.report_type] ?? r.report_type} />
      <Row label="Submitted by" value={r.submitted_by_name || "Unknown"} />
      <Row label="Role" value={r.submitted_by_role} />
      <Row label="App" value={formatAppScreen(r.app, null)} />
      <Row label="Screen" value={r.screen} />
      <Row label="Created" value={fmtDateTime(r.created_at)} />
    </div>

    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</p>
      <p className="text-sm whitespace-pre-wrap break-words">{r.message}</p>
    </div>

    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Environment</p>
      <Row label="Device" value={r.device_type} />
      <Row label="OS" value={r.os} />
      <Row
        label="Browser"
        value={r.browser ? [r.browser, r.browser_version].filter(Boolean).join(" ") : null}
      />
      <Row label="Viewport" value={r.viewport} />
      <Row label="App version" value={r.app_version} />
      <Row
        label="Connection"
        value={r.is_online === null ? null : r.is_online ? "Online" : "Offline"}
      />
      <Row label="Route" value={r.route} />
    </div>

    {r.user_agent && (
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">User agent</p>
        <p className="font-mono text-[11px] text-muted-foreground break-all">{r.user_agent}</p>
      </div>
    )}
  </div>
);

export default SupportReportsTab;
