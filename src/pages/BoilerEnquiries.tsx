import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import {
  BOILER_ENQUIRY_STATUSES,
  BOILER_ENQUIRY_STATUS_LABELS,
  type BoilerEnquiryStatus,
} from "@/lib/boilerEnquiryPayload";

export const STATUS_BADGE: Record<BoilerEnquiryStatus, string> = {
  NEW: "bg-primary/10 text-primary",
  CONTACTED: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  NEEDS_INFO: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  READY_TO_QUOTE: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  QUOTED: "bg-primary/10 text-primary",
  WON: "bg-[hsl(160,84%,90%)] text-[hsl(160,84%,18%)]",
  LOST: "bg-destructive/10 text-destructive",
};

type EnquiryRow = {
  id: string;
  status: BoilerEnquiryStatus;
  created_at: string;
  property_type: string | null;
  bedrooms: string | null;
  bathroom_count: string | null;
  current_heating: string | null;
  installation_timeframe: string | null;
  address: string | null;
  eircode: string | null;
  source: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  customers?: { id: string; name: string | null; phone: string | null; email: string | null } | null;
};

const unique = (values: (string | null)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0))).sort();

const BoilerEnquiries = () => {
  const { user } = useAuth();
  const { ready } = useOrgId();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"All" | BoilerEnquiryStatus>("All");
  const [timeframe, setTimeframe] = useState("All");
  const [source, setSource] = useState("All");
  const [heating, setHeating] = useState("All");
  const [search, setSearch] = useState("");

  const { data: enquiries = [], isLoading } = useQuery({
    queryKey: ["boiler-enquiries", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boiler_enquiries")
        .select("*, customers(id, name, phone, email)")
        .order("created_at", { ascending: false });
      if (error) console.error("Boiler enquiries fetch error:", error);
      return (data || []) as unknown as EnquiryRow[];
    },
    enabled: !!user && ready,
  });

  const timeframeOptions = useMemo(
    () => unique(enquiries.map((e) => e.installation_timeframe)),
    [enquiries],
  );
  const sourceOptions = useMemo(() => unique(enquiries.map((e) => e.source)), [enquiries]);
  const heatingOptions = useMemo(() => unique(enquiries.map((e) => e.current_heating)), [enquiries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enquiries.filter((e) => {
      if (status !== "All" && e.status !== status) return false;
      if (timeframe !== "All" && e.installation_timeframe !== timeframe) return false;
      if (source !== "All" && e.source !== source) return false;
      if (heating !== "All" && e.current_heating !== heating) return false;
      if (!term) return true;
      const haystack = [
        e.customers?.name,
        e.contact_name,
        e.customers?.phone,
        e.contact_phone,
        e.customers?.email,
        e.contact_email,
        e.address,
        e.eircode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [enquiries, status, timeframe, source, heating, search]);

  const newCount = enquiries.filter((e) => e.status === "NEW").length;

  const Select = ({
    value,
    onChange,
    options,
    label,
  }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
    >
      <option value="All">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <Flame className="w-6 h-6 text-primary" />
          Boiler Enquiries
        </h1>
        {newCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {newCount} new
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, mobile, email, address or eircode"
            className="pl-9"
          />
        </div>
        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as "All" | BoilerEnquiryStatus)}
          options={[...BOILER_ENQUIRY_STATUSES]}
        />
        <Select label="Timeframe" value={timeframe} onChange={setTimeframe} options={timeframeOptions} />
        <Select label="Source" value={source} onChange={setSource} options={sourceOptions} />
        <Select label="Heating" value={heating} onChange={setHeating} options={heatingOptions} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No boiler enquiries {enquiries.length === 0 ? "yet" : "match these filters"}.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/boiler-enquiries/${e.id}`)}
                className="w-full text-left"
              >
                <Card className={e.status === "NEW" ? "border-primary/40" : undefined}>
                  <CardContent className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground">
                        {e.customers?.name || e.contact_name || "Unknown customer"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[e.status]}`}>
                        {BOILER_ENQUIRY_STATUS_LABELS[e.status]}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[e.eircode, e.address].filter(Boolean).join(" · ") || "No address"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[e.property_type, e.bedrooms && `${e.bedrooms} bed`, e.current_heating]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[e.installation_timeframe, e.source].filter(Boolean).join(" · ")}
                      {" · "}
                      {format(new Date(e.created_at), "dd/MM/yy")}
                    </p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Customer</th>
                    <th className="px-4 py-3 text-left font-bold">Area</th>
                    <th className="px-4 py-3 text-left font-bold">Property</th>
                    <th className="px-4 py-3 text-left font-bold">Heating</th>
                    <th className="px-4 py-3 text-left font-bold">Timeframe</th>
                    <th className="px-4 py-3 text-left font-bold">Status</th>
                    <th className="px-4 py-3 text-left font-bold">Submitted</th>
                    <th className="px-4 py-3 text-left font-bold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => navigate(`/boiler-enquiries/${e.id}`)}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {e.customers?.name || e.contact_name || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.eircode || e.address || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[e.property_type, e.bedrooms && `${e.bedrooms} bed`, e.bathroom_count && `${e.bathroom_count} bath`]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.current_heating || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.installation_timeframe || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[e.status]}`}>
                          {BOILER_ENQUIRY_STATUS_LABELS[e.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(e.created_at), "dd/MM/yy")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default BoilerEnquiries;
