import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, AlertTriangle, Clock, Info, Euro, Wrench, ChevronDown, ChevronUp, Save,
} from "lucide-react";

/** Currency helper — project convention. */
const eur = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : (n || 0).toLocaleString("en-IE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      });

/** DD/MM/YY — never mix formats. */
const ddmmyy = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

type PeriodType = "week" | "month";

type EngineerRow = {
  engineer_id: string;
  name: string;
  completed_jobs: number;
  cancelled_jobs: number;
  revenue: number;
  cost: number | null;
  gross_profit: number | null;
  gp_pct: number | null;
  job_mix: { service: number; repair: number; install: number; other: number };
  active_job: { status: string; since: string | null } | null;
  skewed_by_large_job: boolean;
};

type Report = {
  period: { type: PeriodType; start: string; end: string };
  cost_source: string;
  team: {
    total_jobs: number;
    revenue: number;
    gross_profit: number | null;
    gp_pct: number | null;
    cancelled_jobs: number;
  };
  engineers: EngineerRow[];
};

type NoteRow = {
  id: string;
  engineer_id: string;
  note: string;
};

const MIX_COLOURS: Record<string, string> = {
  service: "bg-blue-500",
  repair: "bg-amber-500",
  install: "bg-indigo-500",
  other: "bg-slate-300",
};

const MIX_LABELS: Record<string, string> = {
  service: "Service",
  repair: "Repair",
  install: "Install",
  other: "Other",
};

/** Margin health badge. Null cost source => explicit unavailable state. */
const MarginHealthBadge = ({ gpPct }: { gpPct: number | null }) => {
  if (gpPct === null) {
    return (
      <Badge variant="outline" className="gap-1 border-slate-200 text-slate-500">
        Margin —
      </Badge>
    );
  }
  const cls =
    gpPct >= 40
      ? "bg-emerald-100 text-emerald-700"
      : gpPct >= 20
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  return <Badge className={`${cls} hover:${cls}`}>{gpPct.toFixed(0)}% margin</Badge>;
};

const KpiTile = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <div className="mt-1 font-mono text-2xl font-bold tracking-tight">{value}</div>
    {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
  </div>
);

const JobMixBar = ({ mix }: { mix: EngineerRow["job_mix"] }) => {
  const total = mix.service + mix.repair + mix.install + mix.other;
  if (total === 0) {
    return <div className="text-xs text-muted-foreground">No job type data</div>;
  }
  const keys = (["service", "repair", "install", "other"] as const).filter((k) => mix[k] > 0);
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {keys.map((k) => (
          <div
            key={k}
            className={MIX_COLOURS[k]}
            style={{ width: `${(mix[k] / total) * 100}%` }}
            aria-label={`${MIX_LABELS[k]} ${mix[k]}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${MIX_COLOURS[k]}`} />
            {MIX_LABELS[k]} {mix[k]}
          </span>
        ))}
      </div>
    </div>
  );
};

const EngineerNote = ({
  engineerId,
  periodType,
  periodStart,
  existing,
}: {
  engineerId: string;
  periodType: PeriodType;
  periodStart: string;
  existing: NoteRow | undefined;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(existing?.note ?? "");
  const [touched, setTouched] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const value = touched ? draft : (existing?.note ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;

      if (existing) {
        const { error } = await supabase
          .from("engineer_performance_notes")
          .update({ note: value, updated_by: userId })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("engineer_performance_notes").insert({
        engineer_id: engineerId,
        period_type: periodType,
        period_start: periodStart,
        note: value,
        created_by: userId,
        updated_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTouched(false);
      qc.invalidateQueries({ queryKey: ["engineer-performance-notes"] });
      toast({ title: "Note saved" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save note",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="border-t border-slate-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-medium text-slate-600"
      >
        <span>
          Performance note
          {existing?.note ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">Saved</span>
          ) : null}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={value}
            onChange={(e) => {
              setTouched(true);
              setDraft(e.target.value);
            }}
            rows={3}
            placeholder="Private note for this engineer and period (office/admin only)"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Visible to office and admin only. Engineers cannot see this.
            </p>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !touched}
            >
              {save.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const EngineerPerformance = () => {
  const [periodType, setPeriodType] = useState<PeriodType>("week");

  const reportQuery = useQuery({
    queryKey: ["engineer-performance", periodType],
    queryFn: async (): Promise<Report> => {
      const { data, error } = await supabase.functions.invoke("get-engineer-performance", {
        body: { period_type: periodType },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as Report;
    },
    staleTime: 60_000,
  });

  const period = reportQuery.data?.period;

  const notesQuery = useQuery({
    queryKey: ["engineer-performance-notes", periodType, period?.start],
    enabled: !!period?.start,
    queryFn: async (): Promise<NoteRow[]> => {
      const { data, error } = await supabase
        .from("engineer_performance_notes")
        .select("id, engineer_id, note")
        .eq("period_type", periodType)
        .eq("period_start", period!.start);
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const notesByEngineer = useMemo(() => {
    const map = new Map<string, NoteRow>();
    (notesQuery.data ?? []).forEach((n) => map.set(n.engineer_id, n));
    return map;
  }, [notesQuery.data]);

  const report = reportQuery.data;
  const engineers = report?.engineers ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Engineer Performance</h2>
          {period && (
            <p className="text-sm text-muted-foreground">
              {ddmmyy(period.start)} – {ddmmyy(period.end)}
            </p>
          )}
        </div>
        <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
          <TabsList>
            <TabsTrigger value="week">This week</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {report?.cost_source === "unavailable" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Gross profit unavailable.</span> Jobs don't yet
            record a cost, so GP, GP% and margin health show as “—”. Revenue and job counts
            are live.
          </div>
        </div>
      )}

      {reportQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reportQuery.isError ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <div className="font-semibold">Couldn't load engineer performance</div>
              <div className="text-sm text-muted-foreground">
                {(reportQuery.error as any)?.message ?? "Please try again."}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Team KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Jobs completed" value={String(report?.team.total_jobs ?? 0)} />
            <KpiTile label="Revenue" value={eur(report?.team.revenue ?? 0)} />
            <KpiTile
              label="Gross profit"
              value={eur(report?.team.gross_profit ?? null)}
              hint="No cost source"
            />
            <KpiTile
              label="Cancelled jobs"
              value={String(report?.team.cancelled_jobs ?? 0)}
            />
          </div>

          {engineers.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No engineers found for this organisation.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {engineers.map((eng) => (
                <Card key={eng.engineer_id} className="rounded-2xl border-slate-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold">{eng.name}</CardTitle>
                      <MarginHealthBadge gpPct={eng.gp_pct} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {eng.active_job && (
                        <Badge className="gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100">
                          <Clock className="h-3 w-3" />
                          {eng.active_job.status}
                        </Badge>
                      )}
                      {eng.cancelled_jobs > 0 && (
                        <Badge variant="outline" className="border-rose-200 text-rose-700">
                          {eng.cancelled_jobs} cancelled
                        </Badge>
                      )}
                      {eng.skewed_by_large_job && (
                        <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                          <AlertTriangle className="h-3 w-3" />
                          Revenue skewed by 1 large job
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {eng.completed_jobs === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No completed jobs in this period.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Wrench className="h-3 w-3" /> Jobs
                            </div>
                            <div className="font-mono text-lg font-bold">
                              {eng.completed_jobs}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Euro className="h-3 w-3" /> Revenue
                            </div>
                            <div className="font-mono text-lg font-bold">
                              {eur(eng.revenue)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Gross profit</div>
                            <div className="font-mono text-lg font-bold text-slate-400">
                              {eur(eng.gross_profit)}
                            </div>
                          </div>
                        </div>
                        <JobMixBar mix={eng.job_mix} />
                      </>
                    )}
                    <EngineerNote
                      engineerId={eng.engineer_id}
                      periodType={periodType}
                      periodStart={period!.start}
                      existing={notesByEngineer.get(eng.engineer_id)}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            V1 limitation: each job is attributed in full to its lead engineer. Assisting
            engineers are not counted or split.
          </p>
        </>
      )}
    </div>
  );
};

export default EngineerPerformance;
