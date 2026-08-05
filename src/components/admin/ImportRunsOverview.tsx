import { useEffect, useState, Fragment, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { ImportRunDetails } from "@/components/import/ImportRunHistory";
import { ImportRun, parseRowDetails } from "@/components/import/importRunTypes";

/** All-organisation import audit log. RLS decides scope: superadmins see every
 *  org, office/admin users see only their own. */
const ImportRunsOverview = () => {
  const [runs, setRuns] = useState<ImportRun[] | null>(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("import_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setRuns([]);
        return;
      }
      const parsed: ImportRun[] = (data || []).map((r: any) => ({
        ...r,
        row_details: parseRowDetails(r.row_details),
      }));
      setRuns(parsed);

      const orgIds = Array.from(new Set(parsed.map((r) => r.organisation_id)));
      const userIds = Array.from(new Set(parsed.map((r) => r.imported_by)));

      if (orgIds.length > 0) {
        const { data: orgs } = await supabase.from("organisations").select("id, name").in("id", orgIds);
        if (!cancelled) {
          const map: Record<string, string> = {};
          for (const o of orgs || []) map[o.id] = o.name;
          setOrgNames(map);
        }
      }
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (!cancelled) {
          const map: Record<string, string> = {};
          for (const p of profs || []) map[p.user_id] = p.display_name || "—";
          setUserNames(map);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orgOptions = useMemo(
    () => Array.from(new Set((runs || []).map((r) => r.organisation_id))),
    [runs]
  );

  const visibleRuns = useMemo(
    () => (runs || []).filter((r) => orgFilter === "all" || r.organisation_id === orgFilter),
    [runs, orgFilter]
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
          Import runs
        </CardTitle>
        {orgOptions.length > 1 && (
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All organisations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organisations</SelectItem>
              {orgOptions.map((id) => (
                <SelectItem key={id} value={id}>
                  {orgNames[id] || id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent>
        {loadError ? (
          <p className="text-sm text-destructive">Couldn't load import runs: {loadError}</p>
        ) : runs === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visibleRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Organisation</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Imported by</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRuns.map((run) => (
                  <Fragment key={run.id}>
                    <TableRow>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(run.id)} aria-label="Toggle row details">
                          {expanded.has(run.id) ? (
                            <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
                          ) : (
                            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{orgNames[run.organisation_id] || "—"}</TableCell>
                      <TableCell className="font-medium">{run.filename}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {new Date(run.created_at).toLocaleString("en-IE", { timeZone: "Europe/Dublin" })}
                      </TableCell>
                      <TableCell>{userNames[run.imported_by] || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{run.created_count}</TableCell>
                      <TableCell className="text-right font-mono">{run.updated_count}</TableCell>
                      <TableCell className="text-right font-mono">{run.error_count}</TableCell>
                    </TableRow>
                    {expanded.has(run.id) && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/40">
                          <ImportRunDetails details={run.row_details} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportRunsOverview;
