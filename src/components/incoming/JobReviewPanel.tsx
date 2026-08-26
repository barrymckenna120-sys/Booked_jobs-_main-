import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Phone, Mail, MapPin, CheckCircle2, XCircle, MessageCircle, Camera, AlertTriangle, MessageSquare } from "lucide-react";
import MediaGallery from "@/components/media/MediaGallery";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";
import type { CustomerStatusAtBooking } from "@/types/service-calls";


type Job = {
  id: string;
  customer_id: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  assigned_engineer: string | null;
  notes: string | null;
  boiler_brand: string | null;
  boiler_working: boolean | null;
  boiler_issue: string | null;
  source: string | null;
  incoming_status: string | null;
  created_at: string;
  email: string | null;
  job_issue: string | null;
  extra_details: string | null;
  boiler_type: string | null;
  boiler_error_code: string | null;
  area_code: string | null;
  owner_or_tenant: string | null;
  access_notes: string | null;
  job_reference?: string | null;
  /** Set at job creation: 'new' when the customer did not previously exist. */
  customer_status_at_booking?: CustomerStatusAtBooking | null;

};

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  eircode: string;
  area_code: string | null;
  gprn?: string | null;
  access_notes: string | null;
  boiler_make_model: string | null;
  boiler_location?: string | null;
};

type Props = {
  job: Job | null;
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

const JobReviewPanel = ({ job, customer, open, onClose, onUpdated }: Props) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<any[]>([]);
  const [assignEngineer, setAssignEngineer] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignTime, setAssignTime] = useState("");
  const [notes, setNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("engineers").select("*").eq("status", "active").eq("is_available", true).order("name")
        .then(({ data }) => setEngineers(data || []));
    }
  }, [user]);

  useEffect(() => {
    if (job) {
      setAssignDate(job.scheduled_date || "");
      setAssignTime(job.time_block || "");
      setNotes(job.notes || "");
      setShowAssign(false);
      setWhatsappSent(!!(job as any).whatsapp_confirmation_sent);
    }
  }, [job]);

  if (!job || !customer) return null;

  const customerEmail = customer.email || job.email;
  const customerAreaCode = customer.area_code || job.area_code;
  const customerAccessNotes = customer.access_notes && customer.access_notes !== job.access_notes
    ? customer.access_notes
    : null;

  const handleAssign = async () => {
    if (!assignEngineer || !assignDate) {
      toast({ title: "Select an engineer and date", variant: "destructive" });
      return;
    }
    setAssigning(true);
    const matchedEng = engineers.find((e: any) => e.name === assignEngineer);
    await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({
      assigned_engineer: assignEngineer,
      assigned_engineer_id: matchedEng?.id || null,
      scheduled_date: assignDate,
      time_block: assignTime || null,
      incoming_status: "Assigned",
      status: "Scheduled",
      reviewed_by: user?.email,
      reviewed_at: new Date().toISOString(),
      notes: notes || null,
    } as any)).eq("id", job.id);
    setAssigning(false);
    logAudit({ action_type: "job_assigned", entity_type: "service_call", entity_id: job.id, detail: `Incoming job assigned to ${assignEngineer} on ${assignDate}` });
    supabase.functions.invoke('send-booking-confirmation', {
      body: { service_call_id: job.id }
    }).catch(err => console.error('Booking confirmation failed:', err));

    const jobRef = job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`;

    const engRecord = engineers.find((e: any) => e.name === assignEngineer);
    if (engRecord?.email) {
      supabase.functions.invoke("send-email", {
        body: {
          type: "job_assigned",
          data: {
            engineerEmail: engRecord.email,
            engineerName: assignEngineer,
            jobRef,
            date: assignDate,
            time: assignTime || "",
            customerName: customer.name,
            address: `${customer.address}, ${customer.eircode}`,
            phone: customer.phone,
            jobType: job.job_type,
          },
        },
      }).catch(() => {});
    }

    if (customerEmail) {
      supabase.functions.invoke("send-email", {
        body: {
          type: "appointment_confirmation",
          data: {
            customerEmail,
            customerName: customer.name,
            date: assignDate,
            time: assignTime || "",
            engineerName: assignEngineer,
            serviceType: job.job_type,
            jobRef,
          },
        },
      }).catch(() => {});
    }

    toast({ title: `Job assigned to ${assignEngineer}` });
    onUpdated();
    onClose();
  };

  const handleReject = async () => {
    await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({
      incoming_status: "Rejected",
      reviewed_by: user?.email,
      reviewed_at: new Date().toISOString(),
    } as any)).eq("id", job.id);
    logAudit({ action_type: "job_rejected", entity_type: "service_call", entity_id: job.id, detail: "Incoming job rejected" });
    toast({ title: "Job rejected" });
    onUpdated();
    onClose();
  };

  const handleContact = () => {
    const cleanPhone = customer.phone.replace(/\s+/g, "").replace(/^0/, "353");
    const msg = `Hi ${customer.name.split(" ")[0]}, thanks for booking with Karl's Gas.\nWe've received your boiler service request and will confirm your appointment shortly.\nKarl's Gas 🔥`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");

    if (user) {
      supabase.from("whatsapp_messages").insert({
        user_id: user.id,
        organisation_id: orgId!,
        customer_id: customer.id,
        message_type: "Booking Confirmation",
        message_body: msg,
        sent_by: user.email,
        status: "Sent",
      } as any);
    }
  };

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

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {customer.name}
            <span className="text-xs font-normal text-muted-foreground">· {relativeTime(job.created_at)}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {job.source || "Manual"}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Customer Info</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <a href={`tel:${customer.phone}`} className="text-primary font-medium underline">{customer.phone}</a>
              </div>
              <div className="flex items-center gap-2 break-all">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                {customerEmail ? (
                  <a href={`mailto:${customerEmail}`} className="text-primary font-medium underline">{customerEmail}</a>
                ) : (
                  <span className="font-medium">—</span>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Full Address:</span> <span className="font-semibold">{customer.address || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Area Code:</span> <span className="font-semibold">{customerAreaCode || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Eircode:</span> <span className="font-semibold">{customer.eircode || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">GPRN:</span> <span className="font-semibold">{customer.gprn || "—"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Boiler Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Brand:</span> <span className="font-semibold">{job.boiler_brand || "—"}</span></div>
              <div><span className="text-muted-foreground">Model:</span> <span className="font-semibold">{customer.boiler_make_model || "—"}</span></div>
              {customer.boiler_location?.trim() && <div><span className="text-muted-foreground">Location:</span> <span className="font-semibold">{customer.boiler_location}</span></div>}
              {job.boiler_type && <div><span className="text-muted-foreground">Type:</span> <span className="font-semibold">{job.boiler_type}</span></div>}
              {job.boiler_error_code && <div><span className="text-muted-foreground">Error Code:</span> <span className="font-semibold">{job.boiler_error_code}</span></div>}
              <div>
                <span className="text-muted-foreground">Working:</span>{" "}
                {job.boiler_working === false ? (
                  <span className="text-destructive font-bold">✗ No</span>
                ) : job.boiler_working === true ? (
                  <span className="text-success font-bold">✓ Yes</span>
                ) : (
                  <span className="font-semibold">—</span>
                )}
              </div>
            </div>
            {job.boiler_working === false && job.boiler_issue && (
              <div className="flex items-start gap-2 rounded-lg p-3 bg-warning/10 border-l-4 border-warning">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-sm font-medium">Boiler not working: {job.boiler_issue}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> Photos & Videos
            </h4>
            <MediaGallery jobId={job.id} />
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Additional Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {job.job_issue && <div className="col-span-2"><span className="text-muted-foreground">Job Issue:</span> <span className="font-semibold">{job.job_issue}</span></div>}
              {job.access_notes && <div className="col-span-2"><span className="text-muted-foreground">Job Access Notes:</span> <span className="font-semibold">{job.access_notes}</span></div>}
              {customerAccessNotes && <div className="col-span-2"><span className="text-muted-foreground">Customer Access Notes:</span> <span className="font-semibold">{customerAccessNotes}</span></div>}
              {job.extra_details && <div className="col-span-2"><span className="text-muted-foreground">Extra Details:</span> <span className="font-semibold">{job.extra_details}</span></div>}
              {job.owner_or_tenant && <div><span className="text-muted-foreground">Owner/Tenant:</span> <span className="font-semibold">{job.owner_or_tenant}</span></div>}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Booking Preference</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Date:</span> <span className="font-semibold">{job.scheduled_date ? new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}</span></div>
              <div><span className="text-muted-foreground">Time:</span> <span className="font-semibold">{job.time_block || "—"}</span></div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Engineer Notes</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for engineer before visit..."
            />
          </div>

          {showAssign && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Assign Engineer</Label>
                <Select value={assignEngineer} onValueChange={setAssignEngineer}>
                  <SelectTrigger><SelectValue placeholder="Select engineer" /></SelectTrigger>
                  <SelectContent>
                    {engineers.map((e) => (
                      <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Date</Label>
                  <Input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Time Block</Label>
                  <Select value={assignTime} onValueChange={setAssignTime}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Midday">Midday</SelectItem>
                      <SelectItem value="Afternoon">Afternoon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAssign} disabled={assigning} className="w-full">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Assignment
              </Button>
            </div>
          )}

          {job.incoming_status === "Pending" && (
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setShowAssign(true)} disabled={showAssign}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Assign Job
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject this booking?</AlertDialogTitle>
                    <AlertDialogDescription>This will mark the incoming job as rejected.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReject}>Reject</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" onClick={handleContact}>
                <MessageCircle className="w-4 h-4 mr-1" /> Contact
              </Button>
            </div>
          )}

          <div className="pt-2">
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
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default JobReviewPanel;
