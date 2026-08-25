import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  Download,
  ChevronDown,
  ShieldCheck,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ── Action type config ─────────────────────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; icon: string; group: string }> = {
  job_created:       { label: "Job Created",       icon: "📋", group: "Jobs" },
  job_assigned:      { label: "Job Assigned",       icon: "👷", group: "Jobs" },
  job_reassigned:    { label: "Job Reassigned",     icon: "🔁", group: "Jobs" },
  job_started:       { label: "Job Started",        icon: "▶",  group: "Jobs" },
  job_arrived:       { label: "Engineer Arrived",   icon: "📍", group: "Jobs" },
  job_completed:     { label: "Job Completed",      icon: "✅", group: "Jobs" },
  job_cancelled:     { label: "Job Cancelled",      icon: "✕",  group: "Jobs" },
  job_confirmed:     { label: "Job Confirmed",      icon: "👍", group: "Jobs" },
  job_rescheduled:   { label: "Job Rescheduled",    icon: "📅", group: "Jobs" },
  additional_work:   { label: "Additional Work",    icon: "⚠",  group: "Jobs" },
  quote_created:     { label: "Quote Created",      icon: "🧾", group: "Quotes" },
  quote_sent:        { label: "Quote Sent",         icon: "💬", group: "Quotes" },
  quote_accepted:    { label: "Quote Accepted",     icon: "✅", group: "Quotes" },
  quote_approved:    { label: "Quote Approved",     icon: "✅", group: "Quotes" },
  quote_declined:    { label: "Quote Declined",     icon: "✕",  group: "Quotes" },
  quote_rejected:    { label: "Quote Rejected",     icon: "✕",  group: "Quotes" },
  payment_collected: { label: "Payment Collected",  icon: "💰", group: "Payments" },
  payment_updated:   { label: "Payment Updated",    icon: "💳", group: "Payments" },
  user_invited:      { label: "User Invited",       icon: "✉️", group: "Users" },
  user_role_changed: { label: "Role Changed",       icon: "🔄", group: "Users" },
  user_blocked:      { label: "User Blocked",       icon: "🚫", group: "Users" },
  user_unblocked:    { label: "User Unblocked",     icon: "✅", group: "Users" },
  user_removed:      { label: "User Removed",       icon: "🗑", group: "Users" },
  user_login:        { label: "User Logged In",     icon: "🔐", group: "Users" },
  user_login_failed: { label: "Login Failed",       icon: "⛔", group: "Users" },
  settings_changed:  { label: "Settings Changed",   icon: "⚙️", group: "Settings" },
  template_edited:   { label: "Template Edited",    icon: "✏️", group: "Settings" },
  reminder_sent:     { label: "Reminder Sent",      icon: "🔔", group: "Settings" },
  password_reset_requested: { label: "Password Reset Requested", icon: "🔑", group: "Security" },
  password_reset_completed: { label: "Password Reset Completed", icon: "✅", group: "Security" },
};

const ACTION_COLORS: Record<string, string> = {
  Jobs: "bg-blue-100 text-blue-700",
  Quotes: "bg-teal-100 text-teal-700",
  Payments: "bg-green-100 text-green-700",
  Users: "bg-purple-100 text-purple-700",
  Settings: "bg-amber-100 text-amber-700",
  Security: "bg-red-100 text-red-700",
};

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  office: "bg-blue-100 text-blue-700",
  engineer: "bg-green-100 text-green-700",
  customer: "bg-slate-100 text-slate-700",
};

const ROLE_ICONS: Record<string, string> = {
  admin: "👑",
  office: "🏢",
  engineer: "👷",
  customer: "💬",
};

interface AuditEntry {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  metadata: Record<string, unknown>;
}

const GROUPS = ["all", "Jobs", "Quotes", "Payments", "Users", "Settings", "Security"];
const DATE_RANGES = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "48h", label: "Last 48h" },
  { value: "7days", label: "Last 7 Days" },
];
const PER_PAGE = 15;

const AuditLog = () => {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterDate, setFilterDate] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("audit_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500) as { data: AuditEntry[] | null };
    if (data) setEntries(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchEntries();
  }, [user, fetchEntries]);

  // Unique users for filter
  const users = useMemo(() => {
    const seen = new Map<string, string>();
    entries.forEach((e) => {
      if (!seen.has(e.user_id)) seen.set(e.user_id, e.user_name);
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [entries]);

  // Filter + search
  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !entry.detail.toLowerCase().includes(q) &&
          !entry.user_name.toLowerCase().includes(q) &&
          !entry.entity_id.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterGroup !== "all") {
        const a = ACTION_CONFIG[entry.action_type];
        if (!a || a.group !== filterGroup) return false;
      }
      if (filterUser !== "all" && entry.user_id !== filterUser) return false;
      if (filterDate !== "all") {
        const hrs = (Date.now() - new Date(entry.created_at).getTime()) / 3600000;
        if (filterDate === "today" && hrs > 24) return false;
        if (filterDate === "48h" && hrs > 48) return false;
        if (filterDate === "7days" && hrs > 168) return false;
      }
      return true;
    });
  }, [entries, search, filterGroup, filterUser, filterDate]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Stats
  const todayCount = entries.filter(
    (e) => Date.now() - new Date(e.created_at).getTime() < 86400000
  ).length;
  const criticalCount = entries.filter((e) =>
    ["user_blocked", "user_removed", "user_login_failed", "job_cancelled", "password_reset_requested", "password_reset_completed"].includes(e.action_type)
  ).length;
  const completions = entries.filter((e) => e.action_type === "job_completed").length;

  const hasFilters = search || filterGroup !== "all" || filterUser !== "all" || filterDate !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterGroup("all");
    setFilterUser("all");
    setFilterDate("all");
    setPage(1);
  };

  const exportCSV = () => {
    const rows = ["Timestamp,User,Role,Action,Detail,EntityID"];
    filtered.forEach((e) => {
      const ts = format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss");
      const label = ACTION_CONFIG[e.action_type]?.label || e.action_type;
      rows.push(`"${ts}","${e.user_name}","${e.user_role}","${label}","${e.detail}","${e.entity_id}"`);
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookedjobs-audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground">Audit Log</h1>
            <Badge variant="outline" className="gap-1 bg-purple-100 text-purple-700 border-purple-200">
              <ShieldCheck className="w-3 h-3" /> Admin Only
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Every action tracked · {entries.length} events recorded
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV} className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Events Today", value: todayCount, color: "text-blue-600", borderColor: "border-l-blue-500", icon: "📋" },
          { label: "Jobs Completed", value: completions, color: "text-green-600", borderColor: "border-l-green-500", icon: "✅" },
          { label: "Critical Events", value: criticalCount, color: "text-destructive", borderColor: "border-l-destructive", icon: "⚠️" },
          { label: "Total Logged", value: entries.length, color: "text-purple-600", borderColor: "border-l-purple-500", icon: "🗄" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.borderColor}`}>
            <CardContent className="py-4 px-5">
              <div className="text-lg mb-1">{s.icon}</div>
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs font-medium text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search actions, users, details…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {GROUPS.map((g) => (
              <Button
                key={g}
                variant={filterGroup === g ? "default" : "outline"}
                size="sm"
                onClick={() => { setFilterGroup(g); setPage(1); }}
              >
                {g === "all" ? "All" : g}
              </Button>
            ))}
          </div>

          <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterDate} onValueChange={(v) => { setFilterDate(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="text-destructive border-destructive gap-1">
              <X className="w-3 h-3" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Log table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : paginated.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-base font-bold text-foreground mb-1">No events found</div>
            <div className="text-sm">Try adjusting your filters</div>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Header row — desktop */}
          <div className="hidden md:grid grid-cols-[180px_160px_180px_1fr_40px] gap-3 px-5 py-2.5 bg-muted/60 border-b text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <div>Timestamp</div>
            <div>User</div>
            <div>Action</div>
            <div>Detail</div>
            <div />
          </div>

          <div className="divide-y divide-border">
            {paginated.map((entry, idx) => {
              const a = ACTION_CONFIG[entry.action_type] || {
                label: entry.action_type,
                icon: "•",
                group: "Other",
              };
              const groupColor = ACTION_COLORS[a.group] || "bg-muted text-muted-foreground";
              const roleStyle = ROLE_STYLES[entry.user_role] || ROLE_STYLES.engineer;
              const roleIcon = ROLE_ICONS[entry.user_role] || "👤";
              const isExpanded = expandedId === entry.id;
              const ts = new Date(entry.created_at);
              const meta = entry.metadata || {};
              const hasMeta = Object.keys(meta).length > 0;

              return (
                <div key={entry.id} className={isExpanded ? "bg-muted/30" : idx % 2 === 0 ? "" : "bg-muted/20"}>
                  <div
                    className="grid grid-cols-1 md:grid-cols-[180px_160px_180px_1fr_40px] gap-2 md:gap-3 px-4 md:px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors items-center"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    {/* Timestamp */}
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {formatDistanceToNow(ts, { addSuffix: true })}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {format(ts, "HH:mm:ss")}
                      </div>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className={`text-xs font-bold ${roleStyle}`}>
                          {entry.user_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-xs font-bold text-foreground leading-tight">
                          {entry.user_name.split(" ")[0]}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {roleIcon} {entry.user_role}
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div>
                      <Badge variant="outline" className={`gap-1 text-[11px] font-bold ${groupColor}`}>
                        <span>{a.icon}</span> {a.label}
                      </Badge>
                    </div>

                    {/* Detail */}
                    <div className="text-sm text-muted-foreground truncate">{entry.detail}</div>

                    {/* Chevron */}
                    <div className="hidden md:flex justify-end">
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 md:px-5 pb-4 animate-in fade-in slide-in-from-top-1 duration-150">
                      <Card>
                        <CardContent className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                              Full Timestamp
                            </div>
                            <div className="text-xs font-mono text-foreground">
                              {format(ts, "EEE d MMM yyyy · HH:mm:ss")}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                              User
                            </div>
                            <div className="text-sm font-bold text-foreground">{entry.user_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{entry.user_id.slice(0, 8)}…</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                              Entity
                            </div>
                            <div className="text-sm font-bold text-foreground capitalize">
                              {entry.entity_type} · {entry.entity_id.slice(0, 8)}…
                            </div>
                          </div>
                          <div className="sm:col-span-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                              Full Detail
                            </div>
                            <div className="text-sm text-foreground">{entry.detail}</div>
                          </div>
                          {hasMeta && (
                            <div className="sm:col-span-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                Metadata
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(meta).map(([k, v]) => (
                                  <Badge key={k} variant="secondary" className="font-mono text-xs">
                                    {k}: <strong className="ml-1">{String(v)}</strong>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t bg-muted/40 flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="text-xs text-muted-foreground">
              Showing {Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–
              {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} events
            </div>
            {totalPages > 1 && (
              <div className="flex gap-1.5 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | string)[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    typeof p === "number" ? (
                      <Button
                        key={i}
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ) : (
                      <span key={i} className="text-muted-foreground text-sm">…</span>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </Button>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              🔒 Admin only · Stored in audit_log table
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AuditLog;
