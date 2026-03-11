import { useState, useEffect, useMemo } from "react";
import { useLastCompletedService } from "@/hooks/useLastCompletedService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, CalendarDays, User, Wrench, Clock, Repeat, StickyNote, Phone } from "lucide-react";

interface Props {
  customerId: string;
  customer: Record<string, any>;
}

const STATUS_COLORS: Record<string, string> = {
  Completed: "bg-success/10 text-success",
  Cancelled: "bg-destructive/10 text-destructive",
  "In Progress": "bg-warning/10 text-warning",
  Scheduled: "bg-primary/10 text-primary",
  Booked: "bg-primary/10 text-primary",
};

const CustomerHistoryPanel = ({ customerId, customer }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [callNotes, setCallNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetchData();
  }, [customerId]);

  const fetchData = async () => {
    setLoading(true);
    const [jobsRes, notesRes] = await Promise.all([
      supabase
        .from("service_calls")
        .select("id, scheduled_date, job_type, assigned_engineer, status, notes, time_block")
        .eq("customer_id", customerId)
        .order("scheduled_date", { ascending: false }),
      supabase
        .from("customer_call_notes")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true }),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data);
    if (notesRes.data) setCallNotes(notesRes.data);
    setLoading(false);
  };

  // Unique engineers for filter
  const engineers = useMemo(() => {
    const set = new Set(jobs.map((j) => j.assigned_engineer).filter(Boolean));
    return Array.from(set);
  }, [jobs]);

  // Unique statuses for filter
  const statuses = useMemo(() => {
    const set = new Set(jobs.map((j) => j.status).filter(Boolean));
    return Array.from(set);
  }, [jobs]);

  // Count job types for repeat badge
  const jobTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => {
      counts[j.job_type] = (counts[j.job_type] || 0) + 1;
    });
    return counts;
  }, [jobs]);

  // Filtered jobs
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (dateFrom && j.scheduled_date && j.scheduled_date < dateFrom) return false;
      if (dateTo && j.scheduled_date && j.scheduled_date > dateTo) return false;
      if (filterEngineer !== "all" && j.assigned_engineer !== filterEngineer) return false;
      if (filterStatus !== "all" && j.status !== filterStatus) return false;
      return true;
    });
  }, [jobs, dateFrom, dateTo, filterEngineer, filterStatus]);

  // Stats
  const totalVisits = jobs.filter((j) => j.status === "Completed").length;
  const lastVisit = jobs.find((j) => j.status === "Completed")?.scheduled_date;

  const handleSaveNote = async () => {
    if (!newNote.trim() || !user) return;
    setSavingNote(true);
    const { error } = await supabase.from("customer_call_notes").insert({
      customer_id: customerId,
      user_id: user.id,
      note: newNote.trim(),
      created_by_name: user.email?.split("@")[0] || "Office",
    });
    setSavingNote(false);
    if (error) {
      toast({ title: "Error saving note", description: error.message, variant: "destructive" });
    } else {
      setNewNote("");
      fetchData();
    }
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile icon={CalendarDays} label="Total Visits" value={String(totalVisits)} />
        <StatTile icon={Clock} label="Last Visit" value={fmtDate(lastVisit || null)} />
        <StatTile icon={User} label="Last Engineer" value={customer.last_service_engineer || "—"} />
        <StatTile icon={Wrench} label="Next Due" value={fmtDate(customer.next_service_due)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[130px] h-8 text-xs"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[130px] h-8 text-xs"
          placeholder="To"
        />
        <Select value={filterEngineer} onValueChange={setFilterEngineer}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Engineer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Engineers</SelectItem>
            {engineers.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(dateFrom || dateTo || filterEngineer !== "all" || filterStatus !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setDateFrom(""); setDateTo(""); setFilterEngineer("all"); setFilterStatus("all"); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Job list */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No jobs found</p>
        ) : (
          filtered.map((job) => {
            const isRepeat = jobTypeCounts[job.job_type] >= 3;
            const sc = STATUS_COLORS[job.status] || "bg-muted text-muted-foreground";
            return (
              <div
                key={job.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <div className="shrink-0 text-xs text-muted-foreground w-[70px] pt-0.5">
                  {fmtDate(job.scheduled_date)}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-foreground">{job.job_type}</span>
                    {isRepeat && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-warning/40 text-warning">
                        <Repeat className="w-2.5 h-2.5" /> Repeat
                      </Badge>
                    )}
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${sc} border-0`}>
                      {job.status}
                    </Badge>
                  </div>
                  {job.assigned_engineer && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" /> {job.assigned_engineer}
                    </div>
                  )}
                  {job.notes && (
                    <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                      <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{job.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Call Notes */}
      <div className="border-t border-border pt-4 space-y-3">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Phone className="w-4 h-4 text-primary" /> Call Notes
        </h4>

        {callNotes.length > 0 && (
          <div className="space-y-2">
            {callNotes.map((cn) => (
              <div key={cn.id} className="bg-secondary rounded-lg p-2.5 text-sm">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-foreground">{cn.created_by_name || "Office"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(cn.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <p className="text-foreground text-[13px]">{cn.note}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Log a call note…"
            className="text-sm"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSaveNote()}
          />
          <Button size="sm" onClick={handleSaveNote} disabled={!newNote.trim() || savingNote} className="shrink-0">
            {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

const StatTile = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="bg-secondary rounded-lg border border-border p-2.5">
    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
      <Icon className="w-3 h-3" /> {label}
    </div>
    <div className="text-sm font-bold text-foreground mt-0.5">{value}</div>
  </div>
);

export default CustomerHistoryPanel;
