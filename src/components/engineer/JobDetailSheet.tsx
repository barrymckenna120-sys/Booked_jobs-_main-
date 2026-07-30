import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, MessageCircle, Mail } from "lucide-react";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Scheduled:     { color: "text-primary",     bg: "bg-primary/10",     label: "Scheduled" },
  Booked:        { color: "text-primary",     bg: "bg-primary/10",     label: "Booked" },
  "In Progress": { color: "text-warning",     bg: "bg-warning/10",     label: "In Progress" },
  Completed:     { color: "text-success",      bg: "bg-success/10",     label: "Completed" },
  Cancelled:     { color: "text-destructive",  bg: "bg-destructive/10", label: "Cancelled" },
};

const TIME_LABELS: Record<string, string> = {
  "9–11": "9–11am",
  "11–2": "11am–1pm",
  "2–5":  "2–5pm",
};

const getJobRef = (job: any) => job?.job_reference || `KN-${job?.id?.slice(0, 6).toUpperCase() || '???'}`;

const InfoTile = ({ label, value, icon, full }: { label: string; value: string | null; icon?: string; full?: boolean }) => (
  <div className={`bg-secondary rounded-xl border border-border p-3 ${full ? "col-span-2" : ""}`}>
    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
      {icon && <span className="mr-1">{icon}</span>}{label}
    </div>
    <div className="text-[13px] font-bold text-foreground leading-snug">{value || "—"}</div>
  </div>
);

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onStart: (id: string) => void;
}

const JobDetailSheet = ({ job, customer, onClose, onStart }: Props) => {
  const s = STATUS_CONFIG[job.status] || STATUS_CONFIG.Scheduled;

  const { data: jobTags = [] } = useQuery({
    queryKey: ["job-detail-tags", job.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_call_tags")
        .select("tag_id, job_tags(name, colour)")
        .eq("service_call_id", job.id);
      return (data || []).map((r: any) => ({
        name: r.job_tags?.name,
        colour: r.job_tags?.colour,
      })).filter((t: any) => t.name);
    },
  });

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-0.5">{getJobRef(job)}</div>
            <div className="text-xl font-extrabold text-foreground">{customer.name}</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">📍 {customer.address} · {customer.eircode}</div>
          </div>
          <span className={`${s.bg} ${s.color} rounded-full px-3 py-1 text-xs font-bold shrink-0 ml-2`}>
            {s.label}
          </span>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <InfoTile label="Job Type" value={job.job_type} icon="🔧" />
          <InfoTile label="Time Slot" value={TIME_LABELS[job.time_block] || job.time_block} icon="⏰" />

          {/* Contact */}
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">📱 Mobile</div>
            <a href={`tel:${customer.phone}`} className="text-[13px] font-bold text-primary underline leading-snug">
              {customer.phone || "—"}
            </a>
          </div>
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">✉️ Email</div>
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="text-[13px] font-bold text-primary underline leading-snug break-all">
                {customer.email}
              </a>
            ) : (
              <div className="text-[13px] font-bold text-foreground leading-snug">—</div>
            )}
          </div>

          {/* Address */}
          <InfoTile label="Full Address" value={customer.address} icon="📍" full />
          <InfoTile label="Area Code" value={customer.area_code} icon="🗺️" />
          <InfoTile label="Eircode" value={customer.eircode} icon="📮" />
          <InfoTile label="GPRN" value={customer.gprn} icon="🔢" />

          {/* Boiler */}
          <InfoTile label="Boiler Brand" value={job.boiler_brand} icon="🔥" />
          <InfoTile label="Boiler Model" value={customer.boiler_make_model} icon="♨️" />
          {customer.boiler_location?.trim() && <InfoTile label="Boiler Location" value={customer.boiler_location} icon="📍" />}
          {job.boiler_type && <InfoTile label="Boiler Type" value={job.boiler_type} icon="⛽" />}
          {job.boiler_error_code && <InfoTile label="Error Code" value={job.boiler_error_code} icon="⚠️" />}
          {job.boiler_working !== null && job.boiler_working !== undefined && (
            <InfoTile label="Boiler Working" value={job.boiler_working ? "Yes" : "No"} icon={job.boiler_working ? "✅" : "❌"} />
          )}

          {/* Other */}
          <InfoTile
            label="Payment"
            value={job.deposit_paid ? `💳 Paid — €${job.deposit_amount || 0}` : `⏳ €${job.deposit_amount || 0} pending`}
            full
          />
          <InfoTile label="Last Service" value={customer.last_service_date} icon="📅" />
          <InfoTile label="Last Engineer" value={customer.last_service_engineer} icon="👷" />
          {job.owner_or_tenant && <InfoTile label="Owner / Tenant" value={job.owner_or_tenant} icon="🏠" />}
        </div>

        {job.job_issue && (
          <div className="bg-destructive/10 border-l-[3px] border-destructive rounded-r-xl p-3 mb-3.5">
            <div className="text-[11px] font-bold text-destructive uppercase tracking-wider mb-0.5">🔴 Problem Description</div>
            <div className="text-[13px] text-foreground leading-snug">{job.job_issue}</div>
          </div>
        )}

        {job.extra_details && (
          <div className="bg-secondary rounded-xl p-3 mb-3.5">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">📋 Extra Details</div>
            <div className="text-[13px] text-foreground whitespace-pre-wrap">{job.extra_details}</div>
          </div>
        )}

        {job.access_notes && (
          <div className="bg-primary/5 rounded-xl p-3 mb-3.5">
            <div className="text-[11px] font-bold text-primary uppercase tracking-wider mb-0.5">🔑 Access Notes (Job)</div>
            <div className="text-[13px] text-foreground">{job.access_notes}</div>
          </div>
        )}

        {job.boiler_issue && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-xl p-3 mb-3.5">
            <div className="text-[11px] font-bold text-warning uppercase tracking-wider mb-0.5">⚠ Issue Reported</div>
            <div className="text-[13px] text-foreground leading-snug">{job.boiler_issue}</div>
          </div>
        )}

        {job.notes && (
          <div className="bg-secondary rounded-xl p-3 mb-3.5">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">📝 Notes</div>
            <div className="text-[13px] text-foreground whitespace-pre-wrap">{job.notes}</div>
          </div>
        )}

        {customer.access_notes && (
          <div className="bg-primary/5 rounded-xl p-3 mb-3.5">
            <div className="text-[11px] font-bold text-primary uppercase tracking-wider mb-0.5">🔑 Access Note</div>
            <div className="text-[13px] text-foreground">{customer.access_notes}</div>
          </div>
        )}

        {jobTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {jobTags.map((tag: any) => (
              <span
                key={tag.name}
                className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: tag.colour }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={() => window.open(`tel:${customer.phone}`)}>
            <Phone className="w-4 h-4" /> Call
          </Button>
          <Button variant="outline" className="flex-1 gap-1.5 text-success" onClick={() => window.open(`https://wa.me/${customer.phone?.replace(/[^0-9]/g, "")}`, "_blank")}>
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Button>
          <Button variant="outline" className="flex-1 gap-1.5 text-primary" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(customer.address + " " + customer.eircode + " Ireland")}`, "_blank")}>
            <MapPin className="w-4 h-4" /> Navigate
          </Button>
        </div>

        {(job.status === "Scheduled" || job.status === "Booked") && (
          <Button className="w-full h-12 text-base font-extrabold gap-2" onClick={() => { onStart(job.id); onClose(); }}>
            ▶ Start Job
          </Button>
        )}
      </div>
    </EngineerSheet>
  );
};

export default JobDetailSheet;
