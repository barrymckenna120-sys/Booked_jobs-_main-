import { useEffect, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import {
  ImportRun,
  ImportRunRowDetail,
  OUTCOME_LABELS,
  parseRowDetails,
} from "./importRunTypes";

/** Read-only history of past customer imports for one organisation. */
const ImportRunHistory = ({ orgId, refreshKey = 0 }: { orgId: string | null; refreshKey?: number }) => {
  const [runs, setRuns] = useState<ImportRun[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("import_runs")
        .select("*")
        .eq("organisation_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);
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

      const userIds = Array.from(new Set(parsed.map((r) => r.imported_by)));
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (!cancelled) {
          const map: Record<string, string> = {};
          for (const p of profs || []) map[p.user_id] = p.display_name || "—";
          setNames(map);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!orgId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
          Recent imports
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <p className="text-sm text-destructive">Couldn't load import history: {loadError}</p>
        ) : runs === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>File</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Imported by</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
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
                      <TableCell className="font-medium">{run.filename}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {new Date(run.created_at).toLocaleString("en-IE", { timeZone: "Europe/Dublin" })}
                      </TableCell>
                      <TableCell>{names[run.imported_by] || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{run.created_count}</TableCell>
                      <TableCell className="text-right font-mono">{run.updated_count}</TableCell>
                      <TableCell className="text-right font-mono">{run.error_count}</TableCell>
                    </TableRow>
                    {expanded.has(run.id) && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/40">
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

export const ImportRunDetails = ({ details }: { details: ImportRunRowDetail[] }) => {
  if (details.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">No row details recorded.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Row</TableHead>
          <TableHead className="w-56">Outcome</TableHead>
          <TableHead>Message</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {details.map((d, i) => (
          <TableRow key={`${d.row_number}-${i}`}>
            <TableCell className="font-mono">{d.row_number}</TableCell>
            <TableCell>
              <Badge
                variant={
                  d.outcome === "created" || d.outcome === "updated" || d.outcome === "merged"
                    ? "secondary"
                    : d.outcome === "skipped_existing" || d.outcome === "excluded_duplicate"
                      ? "outline"
                      : "destructive"
                }
              >
                {OUTCOME_LABELS[d.outcome] || d.outcome}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {d.error_message || (d.customer_id ? `Customer ${d.customer_id}` : "—")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default ImportRunHistory;
