import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Flame,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { formatWhatsApp } from "@/lib/whatsappLink";
import { openAppUrl, openExternalUrl } from "@/lib/openExternal";
import { useSignedMediaUrls } from "@/lib/mediaUrl";
import { logAudit } from "@/lib/auditLog";
import {
  BOILER_ENQUIRY_STATUSES,
  BOILER_ENQUIRY_STATUS_LABELS,
  showsHeatPumpSection,
  type BoilerEnquiryStatus,
} from "@/lib/boilerEnquiryPayload";
import { STATUS_BADGE } from "./BoilerEnquiries";

type Row = Record<string, any>;

const Field = ({ label, value }: { label: string; value: unknown }) => {
  const text =
    typeof value === "boolean" ? (value ? "Yes" : "No") : String(value ?? "").trim();
  if (!text) return null;
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{text}</dd>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const hasContent = Array.isArray(children)
    ? children.some((c) => c !== null && c !== false)
    : !!children;
  if (!hasContent) return null;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="text-sm font-extrabold text-foreground">{title}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</dl>
      </CardContent>
    </Card>
  );
};

const BoilerEnquiryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId, ready } = useOrgId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingStatus, setSavingStatus] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: enquiry, isLoading } = useQuery({
    queryKey: ["boiler-enquiry", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boiler_enquiries")
        .select("*, customers(id, name, phone, email, address, eircode)")
        .eq("id", id!)
        .maybeSingle();
      if (error) console.error("Boiler enquiry fetch error:", error);
      return (data || null) as Row | null;
    },
    enabled: !!id && !!user && ready,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["boiler-enquiry-photos", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_media")
        .select("id, file_name, file_type, storage_path, public_url, uploaded_at")
        .eq("boiler_enquiry_id", id!)
        .order("uploaded_at");
      return (data || []) as Row[];
    },
    enabled: !!id && !!user && ready,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["boiler-enquiry-quotes", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, quote_number, status, total_amount, created_at")
        .eq("boiler_enquiry_id", id!)
        .order("created_at", { ascending: false });
      return (data || []) as Row[];
    },
    enabled: !!id && !!user && ready,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["boiler-enquiry-activity", id, enquiry?.customer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_activity")
        .select("id, event_type, event_label, event_data, created_at")
        .eq("customer_id", enquiry!.customer_id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []).filter(
        (a: Row) => !a.event_data?.enquiry_id || a.event_data.enquiry_id === id,
      ) as Row[];
    },
    enabled: !!enquiry?.customer_id,
  });

  const signedUrls = useSignedMediaUrls(
    photos.map((p) => ({ id: p.id, storage_path: p.storage_path, public_url: p.public_url })),
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!enquiry) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">
        This enquiry could not be found.
      </div>
    );
  }

  const customer = enquiry.customers || {};
  const name = customer.name || enquiry.contact_name || "Unknown customer";
  const phone = customer.phone || enquiry.contact_phone || "";
  const email = customer.email || enquiry.contact_email || "";
  const address = enquiry.address || customer.address || "";
  const eircode = enquiry.eircode || customer.eircode || "";
  const differences = enquiry.office_review_notes?.customer_differences as
    | Record<string, { existing: string; submitted: string }>
    | undefined;

  const changeStatus = async (next: BoilerEnquiryStatus) => {
    setSavingStatus(true);
    const { error } = await supabase
      .from("boiler_enquiries")
      .update({ status: next })
      .eq("id", enquiry.id);
    setSavingStatus(false);
    if (error) {
      toast({ title: "Could not update status", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit({
      action_type: "status_change",
      entity_type: "boiler_enquiry",
      entity_id: enquiry.id,
      detail: `Boiler enquiry status set to ${BOILER_ENQUIRY_STATUS_LABELS[next]}`,
      organisation_id: orgId || undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["boiler-enquiry", id] });
    queryClient.invalidateQueries({ queryKey: ["boiler-enquiries"] });
  };

  const whatsappHref = phone
    ? `https://wa.me/${formatWhatsApp(phone)}`
    : null;

  const requestInfo = () => {
    if (!whatsappHref) {
      toast({ title: "No mobile number on this enquiry", variant: "destructive" });
      return;
    }
    const text = encodeURIComponent(
      `Hi ${name.split(" ")[0]}, thanks for your new boiler enquiry. Could you send us a little more detail so we can put a quote together?`,
    );
    openExternalUrl(`${whatsappHref}?text=${text}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <button
        onClick={() => navigate("/boiler-enquiries")}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Boiler Enquiries
      </button>

      {/* Header */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-primary">
              <Flame className="w-4 h-4" />
              New boiler enquiry
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[enquiry.status as BoilerEnquiryStatus]}`}
            >
              {BOILER_ENQUIRY_STATUS_LABELS[enquiry.status as BoilerEnquiryStatus]}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {format(new Date(enquiry.created_at), "dd/MM/yy")}
            </span>
          </div>

          <div>
            <h1 className="text-xl font-extrabold text-foreground">{name}</h1>
            <p className="text-sm text-muted-foreground">
              {[phone, email].filter(Boolean).join(" · ") || "No contact details"}
            </p>
            <p className="text-sm text-muted-foreground">
              {[address, eircode].filter(Boolean).join(", ") || "No address"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!phone} onClick={() => openAppUrl(`tel:${phone}`)}>
              <Phone className="w-4 h-4 mr-1.5" /> Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!whatsappHref}
              onClick={() => whatsappHref && openExternalUrl(whatsappHref)}
            >
              <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={requestInfo}>
              Request info
            </Button>
            <Button
              size="sm"
              onClick={() =>
                navigate(
                  `/quotes/new?customer_id=${enquiry.customer_id ?? ""}&boiler_enquiry_id=${enquiry.id}&job_type=New Boiler`,
                )
              }
            >
              <Plus className="w-4 h-4 mr-1.5" /> Create quote
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <select
              aria-label="Enquiry status"
              value={enquiry.status}
              disabled={savingStatus}
              onChange={(e) => changeStatus(e.target.value as BoilerEnquiryStatus)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              {BOILER_ENQUIRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BOILER_ENQUIRY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {differences && Object.keys(differences).length > 0 && (
            <div className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3 text-sm">
              <p className="font-bold text-foreground">Details submitted differ from the customer record</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {Object.entries(differences).map(([field, d]) => (
                  <li key={field}>
                    <span className="font-semibold capitalize">{field}</span>: on file “{d.existing}”, submitted
                    “{d.submitted}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What matters to the customer */}
      {(enquiry.purchase_priority || enquiry.installation_timeframe) && (
        <Card className="border-primary/40">
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-extrabold text-foreground">What matters to the customer</h2>
            <p className="text-lg font-bold text-foreground">{enquiry.purchase_priority || "—"}</p>
            {enquiry.installation_timeframe && (
              <p className="text-sm text-muted-foreground">
                Wants installation {String(enquiry.installation_timeframe).toLowerCase()}
              </p>
            )}
            {enquiry.preferred_contact_method && (
              <p className="text-sm text-muted-foreground">
                Prefers contact by {String(enquiry.preferred_contact_method)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Section title="Property">
        <Field label="Property type" value={enquiry.property_type} />
        <Field label="Bedrooms" value={enquiry.bedrooms} />
        <Field label="Floor area" value={enquiry.floor_area} />
        <Field label="Address" value={address} />
        <Field label="Eircode" value={eircode} />
      </Section>

      <Section title="Hot water">
        <Field label="Bathrooms" value={enquiry.bathroom_count} />
        <Field label="Hot water outlets" value={enquiry.hot_water_outlets} />
        <Field label="Used at the same time" value={enquiry.simultaneous_hot_water_usage} />
        <Field label="Water pressure" value={enquiry.water_pressure} />
        <Field label="Poor hot water flow" value={enquiry.poor_hot_water_flow} />
        <Field label="Cylinder" value={enquiry.hot_water_cylinder} />
        <Field label="Cylinder location" value={enquiry.cylinder_location} />
      </Section>

      <Section title="Heating system">
        <Field label="Current heating" value={enquiry.current_heating} />
        <Field label="Gas connection" value={enquiry.existing_gas_connection} />
        <Field label="Boiler working" value={enquiry.existing_boiler_working} />
        <Field label="Boiler age" value={enquiry.existing_boiler_age} />
        <Field label="Boiler location" value={enquiry.existing_boiler_location} />
        <Field label="Relocation required" value={enquiry.boiler_relocation_required} />
        <Field label="Preferred new location" value={enquiry.preferred_new_location} />
        <Field label="Radiators" value={enquiry.radiator_count} />
        <Field label="Radiator age" value={enquiry.radiator_age} />
        <Field label="Hard to heat rooms" value={enquiry.rooms_hard_to_heat} />
        <Field label="Hard to heat notes" value={enquiry.rooms_hard_to_heat_notes} />
        <Field label="Existing pump" value={enquiry.existing_water_pump} />
      </Section>

      <Section title="Also interested in">
        <Field label="New radiators" value={enquiry.interested_radiators} />
        <Field label="Smart controls" value={enquiry.interested_smart_controls} />
        <Field label="Heating zones" value={enquiry.interested_heating_zones} />
        <Field label="System flushing" value={enquiry.interested_system_flushing} />
        <Field label="Water pressure improvement" value={enquiry.interested_water_pressure_improvement} />
      </Section>

      {showsHeatPumpSection(enquiry as any) && (
        <Section title="Heat pump (customer interest only)">
          <Field label="Interest" value={enquiry.heat_pump_interest} />
          <Field label="BER" value={enquiry.ber} />
          <Field label="Insulation upgraded" value={enquiry.insulation_upgraded} />
        </Section>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-extrabold text-foreground">Photos</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => signedUrls[p.id] && setLightbox(signedUrls[p.id])}
                  className="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {signedUrls[p.id] ? (
                    <img
                      src={signedUrls[p.id]}
                      alt={p.file_name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quotes */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-extrabold text-foreground">Quotes</h2>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quote raised from this enquiry yet.</p>
          ) : (
            <ul className="space-y-2">
              {quotes.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() => navigate(`/quotes/${q.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-bold text-foreground">{q.quote_number || "Quote"}</span>
                    <span className="text-muted-foreground">{q.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Source & attribution */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <button
            onClick={() => setShowAttribution((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-extrabold text-foreground"
          >
            Source &amp; attribution
            <ChevronDown className={`w-4 h-4 transition-transform ${showAttribution ? "rotate-180" : ""}`} />
          </button>
          {showAttribution && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Source" value={enquiry.source} />
              <Field label="Landing page" value={enquiry.landing_page} />
              <Field label="Campaign" value={enquiry.utm_campaign} />
              <Field label="UTM source" value={enquiry.utm_source} />
              <Field label="UTM medium" value={enquiry.utm_medium} />
              <Field label="UTM content" value={enquiry.utm_content} />
              <Field label="UTM term" value={enquiry.utm_term} />
              <Field label="Referrer" value={enquiry.referrer} />
              <Field label="Received from" value={enquiry.external_source} />
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-extrabold text-foreground">Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{a.event_label}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(a.created_at), "dd/MM/yy")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <img src={lightbox} alt="Enquiry photo" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BoilerEnquiryDetail;
