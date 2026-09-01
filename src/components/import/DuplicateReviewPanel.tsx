import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  MATCH_REASON_LABEL,
  completenessScore,
  extraFields,
  type DuplicateGroup,
  type ImportMatchReason,
  type ExistingCustomerLite,
} from "@/lib/importDuplicates";

export type ExistingHistory = { jobs: number; quotes: number; payments: number };

export type ExistingMatchRow = {
  rowNum: number;
  data: Record<string, any>;
  reason: ImportMatchReason;
  customer: ExistingCustomerLite;
  history: ExistingHistory | null;
};

type Props = {
  /** Duplicate clusters found inside the uploaded spreadsheet. */
  groups: DuplicateGroup[];
  /** Row data keyed by spreadsheet row number, for rendering group members. */
  rowsByNum: Map<number, Record<string, any>>;
  excluded: Set<number>;
  onToggleExclude: (rowNum: number, exclude: boolean) => void;
  /** Rows that match exactly one customer already in this organisation. */
  existingMatches: ExistingMatchRow[];
  decisions: Record<number, "skip" | "merge">;
  onDecision: (rowNum: number, decision: "skip" | "merge") => void;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  eircode: "Eircode",
  gprn: "GPRN",
  notes: "Customer Notes",
  engineer_notes: "Engineer Notes",
  access_notes: "Access Notes",
  boiler_brand: "Boiler Brand",
  boiler_model: "Boiler Model",
  boiler_type: "Boiler Type",
  boiler_installation_date: "Installation Date",
  under_warranty: "Under Warranty",
  warranty_years: "Warranty Years",
  owner_or_tenant: "Owner / Tenant",
  last_service_date: "Last Service Date",
  last_service_engineer: "Last Service Engineer",
  next_service_due: "Next Service Due",
  assigned_engineer: "Assigned Engineer",
  customer_since: "Customer Since",
};

const describe = (c: ExistingCustomerLite) =>
  [c.name || "Unnamed customer", c.address].filter(Boolean).join(", ");

const DuplicateReviewPanel = ({
  groups,
  rowsByNum,
  excluded,
  onToggleExclude,
  existingMatches,
  decisions,
  onDecision,
}: Props) => {
  if (groups.length === 0 && existingMatches.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-success/10 border border-success/30 text-success rounded-lg p-3">
        <CheckCircle2 className="w-5 h-5" />
        <span className="text-sm font-medium">
          No duplicates found in this file and no rows match an existing customer.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Copy className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">
                  Duplicate rows in this file ({groups.length} group
                  {groups.length === 1 ? "" : "s"})
                </h3>
                <p className="text-xs text-muted-foreground">
                  The least complete row in each group is pre-selected for exclusion. Untick to
                  keep it, or tick another row to exclude that one instead.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {groups.map((g) => {
                const keepData = rowsByNum.get(g.keepRowNum) || {};
                return (
                  <div key={g.id} className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        Rows {g.rowNums.join(", ")}
                      </Badge>
                      {g.reasons.map((r) => (
                        <Badge key={r} className="bg-warning/20 text-warning-foreground text-[10px]">
                          {MATCH_REASON_LABEL[r]}
                        </Badge>
                      ))}
                    </div>

                    <div className="divide-y divide-border/60">
                      {g.rowNums.map((rowNum) => {
                        const data = rowsByNum.get(rowNum) || {};
                        const isKeepSuggestion = rowNum === g.keepRowNum;
                        const missing = isKeepSuggestion ? [] : extraFields(keepData, data);
                        return (
                          <div key={rowNum} className="flex items-start gap-3 py-2">
                            <Checkbox
                              className="mt-0.5"
                              checked={excluded.has(rowNum)}
                              onCheckedChange={(v) => onToggleExclude(rowNum, v === true)}
                              aria-label={`Exclude row ${rowNum} from this import`}
                            />
                            <div className="min-w-0 flex-1 text-xs">
                              <p className="font-medium">
                                Row {rowNum} · {data.name || "(no name)"}
                                {isKeepSuggestion && (
                                  <Badge variant="secondary" className="ml-2 text-[10px]">
                                    Most complete
                                  </Badge>
                                )}
                                {excluded.has(rowNum) && (
                                  <Badge variant="destructive" className="ml-2 text-[10px]">
                                    Excluded
                                  </Badge>
                                )}
                              </p>
                              <p className="text-muted-foreground truncate">
                                {[data.phone, data.address, data.eircode].filter(Boolean).join(" · ")}
                              </p>
                              <p className="text-muted-foreground">
                                {completenessScore(data)} fields filled
                                {missing.length > 0 &&
                                  ` · missing ${missing
                                    .slice(0, 4)
                                    .map((f) => FIELD_LABELS[f] || f)
                                    .join(", ")}${missing.length > 4 ? "…" : ""}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {existingMatches.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">
                  Already in your customer list ({existingMatches.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Skip keeps the existing record untouched. Merge fills in only the fields the
                  existing record is missing — nothing is overwritten.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {existingMatches.map((m) => {
                const decision = decisions[m.rowNum] ?? "skip";
                const willFill = extraFields(m.data, {
                  name: m.customer.name,
                  address: m.customer.address,
                  eircode: m.customer.eircode,
                  phone: m.customer.phone,
                  gprn: m.customer.gprn,
                });
                return (
                  <div
                    key={m.rowNum}
                    className="rounded-lg border border-border bg-muted/30 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">Row {m.rowNum}</Badge>
                      <Badge className="bg-primary/10 text-primary text-[10px]">
                        {MATCH_REASON_LABEL[m.reason]}
                      </Badge>
                    </div>
                    <p className="text-xs">
                      <span className="font-medium">{m.data.name || "(no name)"}</span>
                      <span className="text-muted-foreground"> matches </span>
                      <span className="font-medium">{describe(m.customer)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.history
                        ? `${m.history.jobs} job${m.history.jobs === 1 ? "" : "s"} · ${m.history.quotes} quote${
                            m.history.quotes === 1 ? "" : "s"
                          } · ${m.history.payments} payment${m.history.payments === 1 ? "" : "s"} on record`
                        : "Loading linked history…"}
                    </p>
                    {willFill.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Merge would fill:{" "}
                        {willFill.slice(0, 5).map((f) => FIELD_LABELS[f] || f).join(", ")}
                        {willFill.length > 5 ? "…" : ""}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={decision === "skip" ? "default" : "outline"}
                        onClick={() => onDecision(m.rowNum, "skip")}
                      >
                        Skip (keep existing)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={decision === "merge" ? "default" : "outline"}
                        onClick={() => onDecision(m.rowNum, "merge")}
                        disabled={willFill.length === 0}
                        title={
                          willFill.length === 0
                            ? "Nothing new to merge — the existing record already has these details"
                            : undefined
                        }
                      >
                        Merge new details
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Nothing is written to the database until you press Confirm Import. Every exclusion,
          skip and merge is recorded in the import history.
        </p>
      )}
    </div>
  );
};

export default DuplicateReviewPanel;
