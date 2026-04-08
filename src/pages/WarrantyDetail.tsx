import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Phone, CalendarDays, MessageSquare, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function parseDateSafe(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00");
}

function formatDateIE(date: Date): string {
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-IE", { month: "long", year: "numeric" });
}

function formatDaysLeft(days: number): string {
  if (days < 0) {
    const absDays = Math.abs(days);
    if (absDays >= 365) {
      const yrs = Math.floor(absDays / 365);
      const mos = Math.floor((absDays % 365) / 30);
      return mos > 0 ? `${yrs}yr ${mos}mo overdue` : `${yrs}yr overdue`;
    }
    if (absDays >= 30) return `${Math.floor(absDays / 30)}mo overdue`;
    return `${absDays}d overdue`;
  }
  if (days >= 365) {
    const yrs = Math.floor(days / 365);
    const mos = Math.floor((days % 365) / 30);
    return mos > 0 ? `${yrs}yr ${mos}mo left` : `${yrs}yr left`;
  }
  if (days >= 30) {
    const mos = Math.floor(days / 30);
    const d = days % 30;
    return d > 0 ? `${mos}mo ${d}d left` : `${mos}mo left`;
  }
  return `${days}d left`;
}

const WarrantyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { engineerName } = useUserRole(user);
  const { toast } = useToast();
  const [customer, setCustomer] = useState<any>(null);
  const [brand, setBrand] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);

  const fetchCustomer = async () => {
    if (!id) return;
    const { data: c } = await supabase
      .from("customers")
      .select("id, name, phone, address, boiler_make_model, boiler_installation_date, last_service_date, notes, warranty_reminder_log")
      .eq("id", id)
      .maybeSingle();

    if (!c) { setLoading(false); return; }

    const makeModel = (c.boiler_make_model || "").trim();
    const firstWord = makeModel.split(/\s+/)[0]?.toLowerCase() || "";
    const firstTwo = makeModel.split(/\s+/).slice(0, 2).join(" ").toLowerCase();

    const { data: brands } = await supabase.from("boiler_brands").select("brand_name, warranty_years");
    const brandsData = brands || [];
    let match = brandsData.find((b: any) => b.brand_name.toLowerCase() === firstWord);
    if (!match) match = brandsData.find((b: any) => b.brand_name.toLowerCase() === firstTwo);

    setCustomer(c);
    setBrand(match || null);
    setLoading(false);
  };

  useEffect(() => { fetchCustomer(); }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!customer || !brand) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Customer or brand data not found.</p>
        <Button variant="outline" onClick={() => navigate("/warranty")} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const installDate = parseDateSafe(customer.boiler_installation_date);
  const expiryDate = new Date(installDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + brand.warranty_years);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysLeft = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = brand.warranty_years * 365;
  const elapsed = totalDays - daysLeft;
  const percentUsed = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
  const isExpiredOrCritical = daysLeft <= 30;

  const firstName = customer.name.split(/\s+/)[0];
  const makeModel = customer.boiler_make_model || "boiler";

  const whatsappMessage = `Hi ${firstName}, this is Nicole from K&N Gas Services.\n\nWe are getting in touch to let you know your ${makeModel} boiler, installed in ${formatMonthYear(installDate)}, is currently covered under the manufacturer's warranty until ${formatMonthYear(expiryDate)}.\n\n⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.\n\nWe would love to take care of that for you. Reply to this message or call us to book your annual service.\n\nK&N Gas Services\n📞 087 3685252`;

  const reminderLog: any[] = Array.isArray(customer.warranty_reminder_log) ? customer.warranty_reminder_log : [];

  const displayName = engineerName || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Office";

  const handleSendWhatsApp = async () => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-warranty-whatsapp", {
        body: {
          phone: customer.phone,
          message: whatsappMessage,
          customer_id: customer.id,
          customer_name: customer.name,
        },
      });
      if (error) throw error;

      const newEntry = { sent_at: new Date().toISOString(), sent_by: displayName };
      const updatedLog = [...reminderLog, newEntry];

      await supabase
        .from("customers")
        .update({ warranty_reminder_log: updatedLog } as any)
        .eq("id", customer.id);

      toast({ title: "WhatsApp sent", description: `Warranty reminder sent to ${firstName}.` });
      await fetchCustomer();
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 pb-24">
      <Button variant="ghost" size="sm" onClick={() => navigate("/warranty")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Warranty Tracker
      </Button>

      {/* Hero Card */}
      <Card className={`p-5 text-white ${isExpiredOrCritical ? "bg-gradient-to-br from-red-600 to-red-800" : "bg-gradient-to-br from-blue-600 to-blue-800"}`}>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5" />
          <span className="text-sm font-medium opacity-90">Warranty Status</span>
        </div>
        <p className="text-2xl font-bold">{formatDaysLeft(daysLeft)}</p>
        <p className="text-sm opacity-80 mt-1">Expires {formatDateIE(expiryDate)}</p>
        <div className="mt-3">
          <Progress value={percentUsed} className="h-2 bg-white/20" />
          <div className="flex justify-between text-xs mt-1 opacity-80">
            <span>Installed {formatDateIE(installDate)}</span>
            <span>{percentUsed}% used</span>
          </div>
        </div>
        <p className="text-xs mt-2 opacity-70">{brand.warranty_years} year warranty</p>
      </Card>

      {/* Boiler Details */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Boiler Details</h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Brand</span>
          <span>{brand.brand_name}</span>
          <span className="text-muted-foreground">Model</span>
          <span>{makeModel}</span>
          <span className="text-muted-foreground">Warranty Period</span>
          <span>{brand.warranty_years} years</span>
          <span className="text-muted-foreground">Install Date</span>
          <span>{formatDateIE(installDate)}</span>
          <span className="text-muted-foreground">Expiry Date</span>
          <span>{formatDateIE(expiryDate)}</span>
          <span className="text-muted-foreground">Days Left</span>
          <span className={daysLeft <= 30 ? "text-red-600 font-semibold" : daysLeft <= 90 ? "text-amber-600 font-semibold" : ""}>
            {formatDaysLeft(daysLeft)}
          </span>
        </div>
      </Card>

      {/* Customer Details */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Customer Details</h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Name</span>
          <span>{customer.name}</span>
          <span className="text-muted-foreground">Phone</span>
          <span>{customer.phone}</span>
          <span className="text-muted-foreground">Address</span>
          <span>{customer.address}</span>
          <span className="text-muted-foreground">Last Service</span>
          <span>{customer.last_service_date ? formatDateIE(parseDateSafe(customer.last_service_date)) : "—"}</span>
          {customer.notes && (
            <>
              <span className="text-muted-foreground">Notes</span>
              <span>{customer.notes}</span>
            </>
          )}
        </div>
      </Card>

      {/* WhatsApp Message Preview */}
      <Collapsible open={msgOpen} onOpenChange={setMsgOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> WhatsApp Message Preview
            </span>
            {msgOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="bg-[#DCF8C6] rounded-lg p-4 text-sm whitespace-pre-wrap border border-green-200">
            {whatsappMessage}
          </div>
          <p className="text-xs text-muted-foreground mt-1">To: {customer.phone}</p>
        </CollapsibleContent>
      </Collapsible>

      {/* Reminder History */}
      {reminderLog.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Reminder History</h2>
          <div className="space-y-2">
            {reminderLog.map((entry: any, i: number) => (
              <div key={i} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <span>
                  {entry.sent_at
                    ? formatDateIE(new Date(entry.sent_at))
                    : "Unknown date"}
                </span>
                <span className="text-muted-foreground">Sent by {entry.sent_by || "Unknown"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        <Button
          className="w-full bg-[#25D366] hover:bg-[#1fba59] text-white"
          onClick={handleSendWhatsApp}
          disabled={sending}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          {sending ? "Sending..." : "Send Warranty WhatsApp"}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <a href={`tel:${customer.phone}`}>
              <Phone className="w-4 h-4 mr-1" /> Call Customer
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/jobs?new=true&customer_id=${customer.id}`)}
          >
            <CalendarDays className="w-4 h-4 mr-1" /> Book Service
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WarrantyDetail;
