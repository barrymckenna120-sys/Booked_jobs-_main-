import { useState, useEffect } from "react";
import type { ScheduleJob } from "@/pages/Schedule";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, ArrowRightLeft, XCircle, MapPin, Wrench, MessageSquare, Phone, Mail, Camera } from "lucide-react";
import MediaGallery from "@/components/media/MediaGallery";
import { formatDateIE } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import JobConfirmedBadge from "@/components/jobs/JobConfirmedBadge";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: ScheduleJob;
  onMarkComplete: (jobId: string) => void;
  onMoveSlot: (job: ScheduleJob) => void;
  onCancel: (jobId: string) => void;
};

const JobSlotDrawer = ({ open, onOpenChange, job, onMarkComplete, onMoveSlot, onCancel }: Props) => {
  const { toast } = useToast();
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  useEffect(() => {
    if (job) {
      supabase.from("service_calls").select("whatsapp_confirmation_sent").eq("id", job.id).single()
        .then(({ data }) => setWhatsappSent(!!(data as any)?.whatsapp_confirmation_sent));
    }
  }, [job]);

  if (!job) return null;

  const jobRef = job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`;
  const customerAccessNotes = job.customer_access_notes && job.customer_access_notes !== job.access_notes
    ? job.customer_access_notes
    : null;

  // Payment wording comes from the shared classifier so the drawer agrees with
  // the Job Detail badge and the engineer job card.
  const payment = resolvePaymentSheetState(job);
  const euro = (n: number) => `€${n.toFixed(2)}`;
  const paymentTone = payment.case === "B" ? "success" : "warning";
  const paymentLabel =
    payment.case === "B"
      ? "Paid"
      : payment.case === "A"
        ? `Deposit Paid — ${euro(payment.balanceDue)} due`
        : payment.case === "D"
          ? `Deposit ${euro(payment.depositAmount)} due`
          : "Unpaid";

  const handleSendWhatsappConfirmation = async () => {
    setSendingWhatsapp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-confirmation", {
        body: { service_call_id: job.id },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || "Send failed");
      setWhatsappSent(true);
      toast({ title: "WhatsApp confirmation sent" });
    } catch (err: any) {
      toast({ title: "Failed to send confirmation", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSendingWhatsapp(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-sm">{jobRef}</span>
            <JobConfirmedBadge confirmed={job.confirmed} confirmedAt={job.confirmed_at} />
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-bold">{job.customer_name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {job.customer_address || "—"}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Mobile</span>
                <div className="mt-0.5">
                  {job.customer_phone ? (
                    <a href={`tel:${job.customer_phone}`} className="font-semibold text-primary underline">
                      {job.customer_phone}
                    </a>
                  ) : (
                    <span className="font-semibold">—</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email</span>
                <div className="mt-0.5 break-all">
                  {job.customer_email ? (
                    <a href={`mailto:${job.customer_email}`} className="font-semibold text-primary underline">
                      {job.customer_email}
                    </a>
                  ) : (
                    <span className="font-semibold">—</span>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Full Address</span>
                <p className="font-semibold mt-0.5">{job.customer_address || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Area Code</span>
                <p className="font-semibold mt-0.5">{job.customer_area_code || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Eircode</span>
                <p className="font-semibold mt-0.5">{job.customer_eircode || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">GPRN</span>
                <p className="font-semibold mt-0.5">{job.customer_gprn || "—"}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Job Type</span>
              <div className="mt-0.5">
                <Badge className={
                  job.job_type === "Emergency"
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : job.job_type === "Repair"
                    ? "bg-warning/10 text-warning border-warning/20"
                    : "bg-primary/10 text-primary border-primary/20"
                }>
                  {job.job_type}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <p className={`font-semibold mt-0.5 ${job.status === "parts_needed" ? "text-warning" : job.status === "parts_ordered" ? "text-primary" : ""}`}>
                {job.status === "parts_needed" ? "Parts Needed" : job.status === "parts_ordered" ? "Parts Ordered" : job.status === "parts_arrived" ? "Awaiting Booking" : job.status === "no_show" ? "No Show" : job.status}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Date</span>
              <p className="font-semibold mt-0.5">{formatDateIE(job.scheduled_date)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Time Slot</span>
              <p className="font-semibold mt-0.5">{job.time_block || "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Engineer</span>
              <div className="flex items-center gap-1 mt-0.5">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-semibold">{job.assigned_engineer || "—"}</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Revenue</span>
              <p className="font-semibold mt-0.5">{job.revenue !== null && job.revenue !== undefined ? `€${job.revenue}` : "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Payment</span>
              <p className={`font-semibold mt-0.5 ${paymentTone === "success" ? "text-success" : "text-warning"}`}>
                {paymentLabel}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Boiler Brand</span>
              <p className="font-semibold mt-0.5">{job.boiler_brand || "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Boiler Model</span>
              <p className="font-semibold mt-0.5">{job.boiler_model || "—"}</p>
            </div>
            {job.customer_boiler_location?.trim() && (
              <div>
                <span className="text-xs text-muted-foreground">Boiler Location</span>
                <p className="font-semibold mt-0.5">{job.customer_boiler_location}</p>
              </div>
            )}
            {job.boiler_error_code && (
              <div>
                <span className="text-xs text-muted-foreground">Error Code</span>
                <p className="font-semibold mt-0.5">{job.boiler_error_code}</p>
              </div>
            )}
            {job.boiler_working !== null && job.boiler_working !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground">Boiler Working</span>
                <p className={`font-semibold mt-0.5 ${job.boiler_working ? "text-success" : "text-destructive"}`}>
                  {job.boiler_working ? "Yes" : "No"}
                </p>
              </div>
            )}
            {job.owner_or_tenant && (
              <div>
                <span className="text-xs text-muted-foreground">Owner / Tenant</span>
                <p className="font-semibold mt-0.5">{job.owner_or_tenant}</p>
              </div>
            )}
            {job.job_issue && (
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Job Issue</span>
                <p className="font-semibold mt-0.5">{job.job_issue}</p>
              </div>
            )}
            {job.access_notes && (
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Job Access Notes</span>
                <p className="font-semibold mt-0.5">{job.access_notes}</p>
              </div>
            )}
            {customerAccessNotes && (
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Customer Access Notes</span>
                <p className="font-semibold mt-0.5">{customerAccessNotes}</p>
              </div>
            )}
            {job.extra_details && (
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Extra Details on Issue</span>
                <p className="font-semibold mt-0.5">{job.extra_details}</p>
              </div>
            )}
          </div>

          {job.notes && (
            <>
              <Separator />
              <div>
                <span className="text-xs text-muted-foreground">Notes</span>
                <p className="text-sm mt-1">{job.notes}</p>
              </div>
            </>
          )}

          {(job.media_count ?? 0) > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Photos &amp; Videos</span>
                </div>
                <MediaGallery jobId={job.id} showUpload={false} />
              </div>
            </>
          )}

          <Separator />

          <div>
            {job.assigned_engineer ? (
              <Button
                onClick={handleSendWhatsappConfirmation}
                disabled={whatsappSent || sendingWhatsapp}
                className="w-full"
                style={{ backgroundColor: whatsappSent ? undefined : "#25D366" }}
                variant={whatsappSent ? "outline" : "default"}
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                {whatsappSent ? "Confirmation Sent ✓" : sendingWhatsapp ? "Sending…" : "Send WhatsApp Confirmation"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground text-center">Assign an engineer to enable WhatsApp confirmation</p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Button className="w-full" onClick={() => onMarkComplete(job.id)}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Complete
            </Button>
            <Button variant="outline" className="w-full" onClick={() => onMoveSlot(job)}>
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Move Slot / Reassign
            </Button>
            <Button variant="destructive" className="w-full" onClick={() => onCancel(job.id)}>
              <XCircle className="w-4 h-4 mr-1" /> Cancel Job
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default JobSlotDrawer;
