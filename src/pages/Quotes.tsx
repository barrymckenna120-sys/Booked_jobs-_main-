import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import {
  FileText, Plus, Clock, CheckCircle2, CreditCard, Send, Edit2, User,
  Loader2, X, MessageCircle, Bell, ArrowLeft, Calendar as CalendarIcon, Save
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SendAllBanner, SendAllQuotesSheet, type UnsentQuote } from "@/components/jobs/SendAllQuotes";
import { format } from "date-fns";
import { validationBorderClass, ValidationMessage } from "@/components/shared/FormValidation";
import FormLeaveGuard from "@/components/shared/FormLeaveGuard";
import { classifyWhatsAppError, getWhatsAppErrorToast } from "@/lib/whatsappErrors";
import { useWhatsAppConnection } from "@/hooks/useWhatsAppConnection";

type Quote = {
  id: string;
  job_id: string;
  customer_id: string;
  description: string;
  parts_cost: number | null;
  labour_cost: number | null;
  callout_cost: number | null;
  total_amount: number;
  status: string;
  sent_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  payment_link: string | null;
  deposit_amount: number | null;
  notes: string | null;
  created_at: string;
  converted_job_id: string | null;
  quote_number: string | null;
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    eircode: string;
  };
  service_calls: {
    id: string;
    job_type: string;
    assigned_engineer: string | null;
    assigned_engineer_id: string | null;
    scheduled_date: string | null;
    time_block: string | null;
  };
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Draft:    { bg: "bg-muted",           text: "text-muted-foreground", dot: "bg-muted-foreground/50" },
  Sent:     { bg: "bg-primary/10",      text: "text-primary",          dot: "bg-primary" },
  Accepted: { bg: "bg-success/10",      text: "text-success",          dot: "bg-success" },
  Rejected: { bg: "bg-destructive/10",  text: "text-destructive",      dot: "bg-destructive" },
  Paid:     { bg: "bg-success/20",      text: "text-success",          dot: "bg-success" },
};

const JOB_TYPE_STYLES: Record<string, string> = {
  Repair:           "bg-purple-100 text-purple-700",
  Emergency:        "bg-destructive/10 text-destructive",
  "Boiler Service": "bg-primary/10 text-primary",
};

const TIME_BLOCKS = [
  { id: "9am–11am", label: "9–11am" },
  { id: "11am–1pm", label: "11am–1pm" },
  { id: "2pm–5pm", label: "2–5pm" },
];

const FILTERS = ["All", "Draft", "Sent", "Accepted", "Paid", "Rejected"];

const Quotes = () => {
  const { user, loading: authLoading } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selected, setSelected] = useState<Quote | null>(null);
  const [tab, setTab] = useState<"details" | "timeline" | "actions">("details");

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [showCreateLeaveGuard, setShowCreateLeaveGuard] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formJobId, setFormJobId] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formParts, setFormParts] = useState("");
  const [formPartsCost, setFormPartsCost] = useState("");
  const [formLabourCost, setFormLabourCost] = useState("");
  const [formCalloutCost, setFormCalloutCost] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createFormErrors, setCreateFormErrors] = useState<Record<string, boolean>>({});
  // WhatsApp send
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [whatsappSending, setWhatsappSending] = useState(false);

  // Send All Quotes
  const [sendAllOpen, setSendAllOpen] = useState(false);

  // Payment link
  const [payOpen, setPayOpen] = useState(false);
  const [payLink, setPayLink] = useState("");
  const [payType, setPayType] = useState<"full" | "deposit">("full");
  const [payDeposit, setPayDeposit] = useState("");

  // Schedule Job modal
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleEngineer, setScheduleEngineer] = useState("");
  const [scheduleErrors, setScheduleErrors] = useState<{ date?: boolean; time?: boolean; engineer?: boolean }>({});
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // Inline edit mode
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ status: "", jobType: "", description: "", total: "", engineerId: "", engineerName: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, boolean>>({});
  const [resendPromptOpen, setResendPromptOpen] = useState(false);
  const [resendQuoteData, setResendQuoteData] = useState<{ phone: string; firstName: string; ref: string; description: string; total: number; notes: string } | null>(null);
  const originalEditFormRef = useRef({ status: "", jobType: "", description: "", total: "", engineerId: "", engineerName: "", notes: "" });

  // Navigation guard for unsaved quote edits
  const { registerGuard } = useNavigationGuard();
  const editDirtyRef = useRef(false);

  // Track dirty state
  const isEditDirty = editMode && (
    editForm.status !== originalEditFormRef.current.status ||
    editForm.jobType !== originalEditFormRef.current.jobType ||
    editForm.description !== originalEditFormRef.current.description ||
    editForm.total !== originalEditFormRef.current.total ||
    editForm.engineerId !== originalEditFormRef.current.engineerId ||
    editForm.notes !== originalEditFormRef.current.notes
  );
  editDirtyRef.current = isEditDirty;

  useEffect(() => {
    const unregister = registerGuard(() => editDirtyRef.current);
    return unregister;
  }, [registerGuard]);

  // Pending action for guarded in-page actions (back button, clicking another quote)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const guardedAction = useCallback((action: () => void) => {
    if (editDirtyRef.current) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }, []);

  const [settings, setSettings] = useState<{ business_phone?: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("settings").select("business_phone").eq("user_id", user.id).single().then(({ data }) => {
      if (data) setSettings(data as any);
    });
  }, [user]);

  const { data: engineers = [] } = useQuery({
    queryKey: ["engineers-for-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("engineers").select("id, name, status").eq("status", "active");
      return data || [];
    },
    enabled: scheduleOpen || editMode,
  });

  const JOB_TYPES = ["Boiler Service", "Repair", "Emergency", "Installation", "Gas Safety Check", "Powerflush", "Other"];
  const EDIT_STATUSES = ["Draft", "Sent", "Accepted", "Declined", "Paid", "Rejected"];

  const startEdit = useCallback((q: Quote) => {
    const initial = {
      status: q.status,
      jobType: q.service_calls?.job_type || "",
      description: q.description,
      total: String(q.total_amount),
      engineerId: "",
      engineerName: q.service_calls?.assigned_engineer || "",
      notes: q.notes || "",
    };
    setEditForm(initial);
    originalEditFormRef.current = initial;
    setEditMode(true);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
  }, []);

  const saveEdit = async () => {
    if (!selected || !user) return;
    const total = parseFloat(editForm.total);
    const errs: Record<string, boolean> = {};
    if (!editForm.description.trim()) errs.description = true;
    if (isNaN(total) || total <= 0) errs.total = true;
    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      return;
    }
    setEditSaving(true);

    // Update quote
    const { error: quoteErr } = await supabase.from("quotes").update({
      status: editForm.status,
      description: editForm.description.trim(),
      total_amount: total,
      notes: editForm.notes.trim() || null,
    } as any).eq("id", selected.id);

    // Update service_calls for job_type and engineer
    const eng = engineers.find((e: any) => e.id === editForm.engineerId);
    const scUpdate: any = { job_type: editForm.jobType };
    if (editForm.engineerId) {
      scUpdate.assigned_engineer = eng?.name || null;
      scUpdate.assigned_engineer_id = editForm.engineerId;
    }
    await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload(scUpdate)).eq("id", selected.job_id);

    setEditSaving(false);
    if (quoteErr) {
      toast({ title: "Error saving", description: quoteErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Quote updated" });
    setEditMode(false);
    fetchQuotes();
    // Refresh selected
    const { data: refreshed } = await supabase
      .from("quotes")
      .select("*, customers!inner(id, name, phone, email, address, eircode), service_calls!quotes_job_id_fkey!inner(id, job_type, assigned_engineer, assigned_engineer_id, scheduled_date, time_block)")
      .eq("id", selected.id)
      .single();
    if (refreshed) setSelected(refreshed as unknown as Quote);

    // Show resend prompt if status is Sent
    if (selected.status === "Sent") {
      const q = (refreshed as unknown as Quote) || selected;
      const phone = q.customers.phone.replace(/\D/g, "");
      const fullPhone = phone.startsWith("353") ? phone : phone.startsWith("0") ? "353" + phone.slice(1) : "353" + phone;
      const ref = `Q-${q.id.slice(0, 4).toUpperCase()}`;
      setResendQuoteData({
        phone: fullPhone,
        firstName: q.customers.name.split(" ")[0],
        ref,
        description: editForm.description.trim(),
        total: total,
        notes: editForm.notes.trim(),
      });
      setResendPromptOpen(true);
    }
  };

  const handleResend = async () => {
    if (!resendQuoteData || !selected) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-whatsapp", {
        body: {
          quote_id: selected.id,
          customer_name: selected.customers.name,
          mobile_number: selected.customers.phone,
          job_description: resendQuoteData.description,
          quote_amount: resendQuoteData.total,
          parts_cost: selected.parts_cost,
          labour_cost: selected.labour_cost,
          business_phone: settings?.business_phone,
          quote_number: selected.quote_number,
        },
      });
      if (error || !data?.success) {
        const errorDetail = data?.error_detail || data?.error || error?.message || "Unknown error";
        const errorType = classifyWhatsAppError(errorDetail);
        toast(getWhatsAppErrorToast(errorType, selected.customers.name, errorDetail));
      } else {
        toast({ title: `WhatsApp sent successfully to ${selected.customers.name} ✅`, duration: 4000 });
        fetchQuotes();
      }
    } catch (err: any) {
      toast({ title: "Resend failed", description: err.message, variant: "destructive" });
    }
    setResendPromptOpen(false);
    setResendQuoteData(null);
  };

  const fetchQuotes = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("*, customers!inner(id, name, phone, email, address, eircode), service_calls!quotes_job_id_fkey!inner(id, job_type, assigned_engineer, assigned_engineer_id, scheduled_date, time_block)")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false });
    setQuotes((data || []) as unknown as Quote[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      // Silently expire overdue quotes before fetching
      supabase.functions.invoke("expire-quotes").finally(() => fetchQuotes());
    }
  }, [user]);

  const hasActiveFilters = searchTerm.trim() !== "" || !!dateFrom || !!dateTo;
  const clearAllFilters = () => { setSearchTerm(""); setDateFrom(undefined); setDateTo(undefined); setFilter("All"); };

  const filtered = quotes.filter((q) => {
    // Status filter
    if (filter !== "All" && filter !== "Open") {
      if (q.status !== filter) return false;
    }
    if (filter === "Open" && !["Draft", "Sent"].includes(q.status)) return false;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const ref = `q-${q.id.slice(0, 4).toLowerCase()}`;
      const name = (q.customers?.name || "").toLowerCase();
      if (!ref.includes(term) && !name.includes(term)) return false;
    }

    // Date range filter
    if (dateFrom) {
      const created = new Date(q.created_at);
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (created < from) return false;
    }
    if (dateTo) {
      const created = new Date(q.created_at);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (created > to) return false;
    }

    return true;
  });

  const kpi = {
    total: quotes.length,
    totalValue: quotes.reduce((s, q) => s + Number(q.total_amount || 0), 0),
    open: quotes.filter((q) => ["Draft", "Sent"].includes(q.status)).length,
    openValue: quotes.filter((q) => ["Draft", "Sent"].includes(q.status)).reduce((s, q) => s + Number(q.total_amount || 0), 0),
    accepted: quotes.filter((q) => q.status === "Accepted").length,
    acceptedValue: quotes.filter((q) => q.status === "Accepted").reduce((s, q) => s + Number(q.total_amount || 0), 0),
    paid: quotes.filter((q) => q.status === "Paid").length,
    paidValue: quotes.filter((q) => q.status === "Paid").reduce((s, q) => s + Number(q.total_amount || 0), 0),
  };

  const sentCount = quotes.filter((q) => q.status === "Sent").length;

  // Unsent quotes for Send All feature
  const unsentQuotes: UnsentQuote[] = quotes
    .filter(q => q.status === "Sent")
    .map(q => ({
      id: q.id,
      customer: q.customers?.name || "Unknown",
      phone: q.customers?.phone || "",
      jobType: q.service_calls?.job_type || "Job",
      total: Number(q.total_amount) || 0,
      description: q.description,
      notes: q.notes || "",
      quoteId: q.id,
      parts_cost: q.parts_cost,
      labour_cost: q.labour_cost,
      business_phone: settings?.business_phone,
      quote_number: q.quote_number,
    }));

  const handleQuoteSent = async (quoteId: string) => {
    await supabase.from("quotes").update({ status: "Sent", sent_at: new Date().toISOString() } as any).eq("id", quoteId);
    fetchQuotes();
  };

  // ── Status update ──
  const updateStatus = async (quoteId: string, newStatus: string, extra: Record<string, any> = {}) => {
    await supabase.from("quotes").update({ status: newStatus, ...extra } as any).eq("id", quoteId);

    // Auto-create job when accepted
    if (newStatus === "Accepted") {
      const quote = quotes.find(q => q.id === quoteId) || selected;
      if (quote && !quote.converted_job_id && user) {
        const quoteRef = `Q-${quote.id.slice(0, 4).toUpperCase()}`;
        const { data: newJob, error: jobErr } = await supabase.from("service_calls").insert({
          customer_id: quote.customer_id,
          user_id: user.id,
          organisation_id: orgId!,
          job_type: quote.service_calls?.job_type || "Repair",
          job_issue: quote.description,
          assigned_engineer: quote.service_calls?.assigned_engineer || null,
          assigned_engineer_id: quote.service_calls?.assigned_engineer_id || null,
          status: "Pending",
          has_quote: true,
          notes: `Created from quote ${quoteRef}`,
          source: "Quote",
          revenue: quote.total_amount || null,
        } as any).select("id").single();

        if (newJob && !jobErr) {
          await supabase.from("quotes").update({ converted_job_id: newJob.id } as any).eq("id", quoteId);
          toast({ title: `Job created from quote ${quoteRef}` });
        } else {
          toast({ title: `Quote marked as ${newStatus}` });
          if (jobErr) console.error("Failed to create job from quote:", jobErr);
        }
      } else {
        toast({ title: `Quote marked as ${newStatus}` });
      }
    } else {
      toast({ title: `Quote marked as ${newStatus}` });
    }

    fetchQuotes();
    if (selected?.id === quoteId) {
      // Re-fetch the selected quote to get converted_job_id
      const { data: refreshed } = await supabase
        .from("quotes")
        .select("*, customers!inner(id, name, phone, email, address, eircode), service_calls!quotes_job_id_fkey!inner(id, job_type, assigned_engineer, assigned_engineer_id, scheduled_date, time_block)")
        .eq("id", quoteId)
        .single();
      if (refreshed) setSelected(refreshed as unknown as Quote);
    }
  };

  // ── Create form handlers ──
  const openCreate = async () => {
    if (!user) return;
    setFormCustomerId(""); setFormJobId(""); setFormDesc(""); setFormParts("");
    setFormPartsCost(""); setFormLabourCost(""); setFormCalloutCost("");
    setFormTotal(""); setShowBreakdown(false);

    const { data: c } = await supabase.from("customers").select("id, name, phone").eq("organisation_id", orgId).order("name");
    setCustomers(c || []);
    setJobs([]);
    setCreateOpen(true);
  };

  const onCustomerSelect = async (customerId: string) => {
    setFormCustomerId(customerId);
    const { data: j } = await supabase.from("service_calls").select("id, job_type, scheduled_date")
      .eq("customer_id", customerId).order("created_at", { ascending: false });
    setJobs(j || []);
    if (j?.length === 1) setFormJobId(j[0].id);
  };

  const calcTotal = showBreakdown
    ? (parseFloat(formPartsCost) || 0) + (parseFloat(formLabourCost) || 0) + (parseFloat(formCalloutCost) || 0)
    : parseFloat(formTotal) || 0;

  const handleCreate = async (andSend?: boolean) => {
    // Inline validation
    const createErrors: Record<string, boolean> = {};
    if (!formCustomerId) createErrors.customer = true;
    if (!formJobId) createErrors.job = true;
    if (!formDesc.trim()) createErrors.description = true;
    if (calcTotal <= 0) createErrors.total = true;
    if (Object.keys(createErrors).length > 0) {
      setCreateFormErrors(createErrors);
      return;
    }
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase.from("quotes").insert([{
      user_id: user.id,
      organisation_id: orgId!,
      customer_id: formCustomerId,
      job_id: formJobId,
      description: formDesc.trim(),
      parts_cost: showBreakdown ? parseFloat(formPartsCost) || 0 : null,
      labour_cost: showBreakdown ? parseFloat(formLabourCost) || 0 : null,
      callout_cost: showBreakdown ? parseFloat(formCalloutCost) || 0 : null,
      total_amount: calcTotal,
      status: "Draft",
    }] as any).select("*, customers!inner(id, name, phone, email, address, eircode), service_calls!inner(id, job_type, assigned_engineer, scheduled_date, time_block)").single();

    await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({ has_quote: true } as any)).eq("id", formJobId);
    setSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Quote created" });
    setCreateOpen(false);
    fetchQuotes();

    if (andSend && data) {
      const q = data as unknown as Quote;
      setSelected(q);
      openWhatsApp(q);
    }
  };

  // ── WhatsApp ──
  const openWhatsApp = (q: Quote) => {
    const firstName = q.customers.name.split(" ")[0];
    const refNumber = `Q-${q.id.slice(0, 4).toUpperCase()}`;
    const parts = Number(q.parts_cost || 0);
    const labour = Number(q.labour_cost || 0);
    const total = Number(q.total_amount).toFixed(2);
    let breakdown = "";
    if (parts > 0) breakdown += `• Parts: €${parts.toFixed(2)}\n`;
    if (labour > 0) breakdown += `• Labour: €${labour.toFixed(2)}\n`;
    breakdown += `• Total: €${total}`;
    setWhatsappMsg(
      `Hi ${firstName},\n\nHere is your quote from Karl's Gas.\n\nQuote Ref: ${refNumber}\n\nJob: ${q.description}\n\nBreakdown:\n${breakdown}\n\nTo accept this quote, simply reply *YES* to this message.\n\nThis quote is valid for 14 days from today.\n\nKarl's Gas${settings?.business_phone ? `\n📞 ${settings.business_phone}` : ""}`
    );
    setWhatsappOpen(true);
  };

  const sendWhatsApp = async (q: Quote) => {
    setWhatsappSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-whatsapp", {
        body: {
          quote_id: q.id,
          customer_name: q.customers.name,
          mobile_number: q.customers.phone,
          job_description: q.description,
          quote_amount: Number(q.total_amount),
          parts_cost: q.parts_cost,
          labour_cost: q.labour_cost,
          business_phone: settings?.business_phone,
          quote_number: q.quote_number,
        },
      });
      if (error || !data?.success) {
        const errorDetail = data?.error_detail || data?.error || error?.message || "Unknown error";
        const errorType = classifyWhatsAppError(errorDetail);
        toast(getWhatsAppErrorToast(errorType, q.customers.name, errorDetail));
      } else {
        toast({ title: `WhatsApp sent successfully to ${q.customers.name} ✅`, duration: 4000 });
        fetchQuotes();
        if (selected?.id === q.id) {
          setSelected((prev) => prev ? { ...prev, status: "Sent", sent_at: new Date().toISOString() } : null);
        }
      }
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    }
    setWhatsappSending(false);
    setWhatsappOpen(false);
  };

  // ── Payment ──
  const openPay = (q: Quote) => {
    setPayLink(q.payment_link || "");
    setPayType(q.deposit_amount ? "deposit" : "full");
    setPayDeposit(q.deposit_amount?.toString() || "");
    setPayOpen(true);
  };

  const savePay = async (q: Quote) => {
    if (!payLink.trim()) { toast({ title: "Enter a payment link", variant: "destructive" }); return; }
    await supabase.from("quotes").update({
      payment_link: payLink.trim(),
      deposit_amount: payType === "deposit" ? parseFloat(payDeposit) || null : null,
    } as any).eq("id", q.id);
    toast({ title: "Payment link saved" });
    setPayOpen(false);
    fetchQuotes();
  };

  // ── Schedule Job ──
  const handleScheduleJob = async () => {
    if (!selected || !user) return;
    const errors: typeof scheduleErrors = {};
    if (!scheduleDate) errors.date = true;
    if (!scheduleTime) errors.time = true;
    if (!scheduleEngineer) errors.engineer = true;
    if (Object.keys(errors).length > 0) {
      setScheduleErrors(errors);
      return;
    }
    setScheduleSaving(true);
    const eng = engineers.find((e: any) => e.id === scheduleEngineer);
    const dateStr = format(scheduleDate!, "yyyy-MM-dd");
    const { error } = await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({
      scheduled_date: dateStr,
      time_block: scheduleTime,
      assigned_engineer: eng?.name || null,
      assigned_engineer_id: scheduleEngineer,
      status: "Scheduled",
    } as any)).eq("id", selected.job_id);
    if (error) {
      toast({ title: "Error scheduling", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("quotes").update({ status: "Converted" } as any).eq("id", selected.id);
      toast({ title: "Job scheduled and quote converted" });
      setScheduleOpen(false);
      fetchQuotes();
      setSelected(null);
    }
    setScheduleSaving(false);
  };

  // ── Relative time ──
  const relTime = (d: string | null) => {
    if (!d) return null;
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  // KPI card filter mapping
  const kpiCards = [
    { icon: <FileText className="w-4 h-4 text-primary" />, value: kpi.total, euro: kpi.totalValue, label: "Total", accent: "border-t-primary", filterValue: "All" },
    { icon: <Clock className="w-4 h-4 text-warning" />, value: kpi.open, euro: kpi.openValue, label: "Open", accent: "border-t-warning", filterValue: "Open" },
    { icon: <CheckCircle2 className="w-4 h-4 text-success" />, value: kpi.accepted, euro: kpi.acceptedValue, label: "Accepted", accent: "border-t-success", filterValue: "Accepted" },
    { icon: <CreditCard className="w-4 h-4 text-success" />, value: kpi.paid, euro: kpi.paidValue, label: "Paid", accent: "border-t-success", filterValue: "Paid" },
  ];

  // Handle KPI card click: "Open" maps to showing Draft+Sent, others map directly
  const handleKpiClick = (filterValue: string) => {
    if (filterValue === "Open") {
      // For Open, we show Draft+Sent — use "All" filter but actually custom
      setFilter(filter === "Open" ? "All" : "Open");
    } else {
      setFilter(filter === filterValue ? "All" : filterValue);
    }
  };

  // Override filtered for "Open" pseudo-filter — now handled in unified filter above
  const displayedQuotes = filtered;

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Quotes</h1>
          <p className="text-sm text-muted-foreground">
            {sentCount > 0 ? `${sentCount} awaiting approval` : "All quotes"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> New Quote
        </Button>
      </div>

      {/* KPI Cards — tappable filters */}
      <div className="grid grid-cols-4 gap-3">
        {kpiCards.map((k) => {
          const isActive = filter === k.filterValue;
          return (
            <Card
              key={k.label}
              className={`shadow-sm border-t-[3px] ${k.accent} cursor-pointer transition-all ${isActive ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
              onClick={() => handleKpiClick(k.filterValue)}
            >
              <CardContent className="pt-3 pb-3 px-4">
                <div className="mb-1">{k.icon}</div>
                <p className="text-xl font-extrabold">{k.value}</p>
                <p className="text-[13px] font-medium text-muted-foreground">€{k.euro.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">{k.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const s = STATUS_STYLES[f];
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                active
                  ? f === "All"
                    ? "bg-primary/10 text-primary border-primary"
                    : `${s?.bg} ${s?.text} border-current`
                  : "bg-card text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Search & Date Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search by name or ref (e.g. Q-3523)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", dateFrom && "border-primary text-primary")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateFrom ? format(dateFrom, "dd MMM") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", dateTo && "border-primary text-primary")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateTo ? format(dateTo, "dd MMM") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive hover:text-destructive" onClick={clearAllFilters}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {!loading && (() => {
        const recent = quotes.filter(q => {
          if (q.status !== "Accepted" && q.status !== "Rejected") return false;
          const respondedAt = q.accepted_at || q.created_at;
          const hoursSince = (Date.now() - new Date(respondedAt).getTime()) / 3600000;
          return hoursSince < 24;
        });
        if (recent.length === 0) return null;
        return (
          <div className="space-y-2">
            {recent.map(q => {
              const accepted = q.status === "Accepted";
              const phone = q.customers.phone.replace(/\D/g, "");
              const fullPhone = phone.startsWith("353") ? phone : phone.startsWith("0") ? "353" + phone.slice(1) : "353" + phone;
              const ref = `Q-${q.id.slice(0, 4).toUpperCase()}`;
              const waMsg = accepted
                ? `Hi ${q.customers.name.split(" ")[0]}, thanks for accepting quote ${ref} (€${Number(q.total_amount).toFixed(2)}). We'll be in touch to schedule your appointment!`
                : `Hi ${q.customers.name.split(" ")[0]}, we noticed you declined quote ${ref}. If you have any questions or would like to discuss, just let us know!`;
              const waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(waMsg)}`;

              return (
                <Card key={q.id} className={`border-l-4 ${accepted ? "border-l-success bg-success/5" : "border-l-destructive bg-destructive/5"}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bell className={`w-4 h-4 shrink-0 ${accepted ? "text-success" : "text-destructive"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">
                          {q.customers.name} {accepted ? "accepted" : "declined"} {ref}
                        </p>
                        <p className="text-xs text-muted-foreground">€{Number(q.total_amount).toFixed(2)} · {relTime(q.accepted_at || q.created_at)}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 gap-1.5" asChild>
                      <a href={waLink} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="w-3.5 h-3.5" /> Reply
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })()}

      {/* Send All Banner */}
      {!loading && <SendAllBanner unsentQuotes={unsentQuotes} onSendAll={() => setSendAllOpen(true)} />}

      {/* Quote cards */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading quotes...</p>
      ) : displayedQuotes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-3">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-bold">No {filter !== "All" ? filter + " " : ""}quotes {hasActiveFilters ? "match your filters" : "found"}</p>
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters ? <Button variant="link" className="p-0 h-auto text-sm" onClick={clearAllFilters}>Clear all filters</Button> : "Tap + New Quote to create one"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {displayedQuotes.map((q) => {
            const ss = STATUS_STYLES[q.status] || STATUS_STYLES.Draft;
            const jt = JOB_TYPE_STYLES[q.service_calls?.job_type] || "bg-muted text-muted-foreground";
            return (
              <Card
                key={q.id}
                className="cursor-pointer hover:shadow-md transition-all border-l-4"
                style={{ borderLeftColor: `var(--${q.status === "Paid" ? "success" : q.status === "Sent" ? "primary" : q.status === "Rejected" ? "destructive" : q.status === "Accepted" ? "success" : "border"})` }}
                onClick={() => guardedAction(() => { setSelected(q); setTab("details"); setEditMode(false); })}
              >
                <CardContent className="p-4">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-semibold">Q-{q.id.slice(0, 4).toUpperCase()}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${jt}`}>
                        {q.service_calls?.job_type || "Job"}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${ss.bg} ${ss.text}`}>
                      <span className={`w-[7px] h-[7px] rounded-full ${ss.dot}`} />
                      {q.status}
                    </span>
                  </div>
                  {/* Customer & description */}
                  <p className="font-extrabold text-base">{q.customers?.name}</p>
                  <p className="text-sm text-muted-foreground line-clamp-1 mb-2.5">{q.description}</p>
                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      <User className="w-3.5 h-3.5 inline mr-0.5" /> {q.service_calls?.assigned_engineer || "—"} · {relTime(q.created_at)}
                    </span>
                    <span className="text-lg font-extrabold">€{Number(q.total_amount).toLocaleString()}</span>
                  </div>

                  {/* Accepted quote — scheduled date footer */}
                  {q.status === "Accepted" && (
                    <div className="mt-2.5 pt-2 border-t border-border">
                      {q.service_calls?.scheduled_date ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          <span>Scheduled: {format(new Date(q.service_calls.scheduled_date + "T00:00:00"), "EEE d MMM")}{q.service_calls.time_block ? ` · ${q.service_calls.time_block}` : ""}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-warning font-semibold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Not yet scheduled</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Quote Detail Sheet ── */}
      <Sheet open={!!selected} onOpenChange={(v) => { if (!v) guardedAction(() => { setSelected(null); setEditMode(false); }); }}>
        <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto p-0">
          {selected && (() => {
            const q = selected;
            const ss = STATUS_STYLES[q.status] || STATUS_STYLES.Draft;
            const jt = JOB_TYPE_STYLES[q.service_calls?.job_type] || "bg-muted text-muted-foreground";

            const timeline = [
              { label: "Quote created", time: fmtDate(q.created_at), done: true },
              { label: "Sent to customer", time: fmtDate(q.sent_at), done: ["Sent", "Accepted", "Paid", "Rejected"].includes(q.status) },
              { label: "Customer accepted", time: fmtDate(q.accepted_at), done: ["Accepted", "Paid"].includes(q.status) },
              { label: "Payment received", time: fmtDate(q.paid_at), done: q.status === "Paid" },
            ];

            return (
              <>
                {/* Back button + Header */}
                <div className="p-5 pb-4 border-b border-border">
                  <button
                    onClick={() => guardedAction(() => { setSelected(null); setEditMode(false); })}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-3 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Quotes
                  </button>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] text-muted-foreground font-semibold">Q-{q.id.slice(0, 4).toUpperCase()}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${jt}`}>{q.service_calls?.job_type}</span>
                      </div>
                      <p className="text-xl font-extrabold">{q.customers.name}</p>
                      <p className="text-sm text-muted-foreground">{q.customers.address} · {q.customers.eircode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editMode ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                          <Button size="sm" onClick={saveEdit} disabled={editSaving} className="gap-1.5">
                            {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(q)} className="gap-1.5">
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${ss.bg} ${ss.text}`}>
                            <span className={`w-[7px] h-[7px] rounded-full ${ss.dot}`} />
                            {q.status}
                          </span>
                        </>
                      )}
                    </div>
                    {q.sent_at && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Sent: {new Date(q.sent_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })} at {new Date(q.sent_at).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                  {(["details", "timeline", "actions"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 py-3 text-sm capitalize transition-colors ${
                        tab === t
                          ? "font-bold text-primary border-b-2 border-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* Details Tab */}
                  {tab === "details" && (
                    <div className="space-y-4">
                      {editMode ? (
                        <>
                          {/* Edit mode form */}
                          <Card>
                            <CardContent className="p-4 space-y-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Status</Label>
                                <Select value={editForm.status} onValueChange={(v) => setEditForm(f => ({ ...f, status: v }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {EDIT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Job Type</Label>
                                <Select value={editForm.jobType} onValueChange={(v) => setEditForm(f => ({ ...f, jobType: v }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {JOB_TYPES.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Work Description *</Label>
                                <Textarea
                                  value={editForm.description}
                                  onChange={(e) => { setEditForm(f => ({ ...f, description: e.target.value })); setEditErrors(er => ({ ...er, description: false })); }}
                                  onBlur={() => { if (!editForm.description.trim()) setEditErrors(er => ({ ...er, description: true })); }}
                                  rows={3}
                                  className={validationBorderClass(!!editErrors.description)}
                                />
                                <ValidationMessage show={!!editErrors.description} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Total (€) *</Label>
                                <Input
                                  type="number"
                                  value={editForm.total}
                                  onChange={(e) => { setEditForm(f => ({ ...f, total: e.target.value })); setEditErrors(er => ({ ...er, total: false })); }}
                                  onBlur={() => { const t = parseFloat(editForm.total); if (isNaN(t) || t <= 0) setEditErrors(er => ({ ...er, total: true })); }}
                                  className={validationBorderClass(!!editErrors.total)}
                                />
                                <ValidationMessage show={!!editErrors.total} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Assigned Engineer</Label>
                                <Select value={editForm.engineerId} onValueChange={(v) => {
                                  const eng = engineers.find((e: any) => e.id === v);
                                  setEditForm(f => ({ ...f, engineerId: v, engineerName: eng?.name || "" }));
                                }}>
                                  <SelectTrigger>
                                    <SelectValue placeholder={editForm.engineerName || "Select engineer"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {engineers.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Notes</Label>
                                <Textarea
                                  value={editForm.notes}
                                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                  rows={2}
                                  placeholder="Internal notes for this quote..."
                                />
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      ) : (
                        <>
                          {/* Read-only view */}
                          <Card>
                            <CardContent className="p-4 space-y-3">
                              <div>
                                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Work Description</p>
                                <p className="text-sm font-semibold">{q.description}</p>
                              </div>
                              <div className="border-t border-border pt-3 space-y-1.5">
                                {q.parts_cost ? (
                                  <div className="flex justify-between text-sm border-b border-dashed border-border pb-1.5">
                                    <span className="text-muted-foreground">Parts</span>
                                    <span>€{Number(q.parts_cost).toFixed(2)}</span>
                                  </div>
                                ) : null}
                                {q.labour_cost ? (
                                  <div className="flex justify-between text-sm border-b border-dashed border-border pb-1.5">
                                    <span className="text-muted-foreground">Labour</span>
                                    <span>€{Number(q.labour_cost).toFixed(2)}</span>
                                  </div>
                                ) : null}
                                {q.callout_cost ? (
                                  <div className="flex justify-between text-sm border-b border-border pb-1.5">
                                    <span className="text-muted-foreground">Call-Out</span>
                                    <span>€{Number(q.callout_cost).toFixed(2)}</span>
                                  </div>
                                ) : null}
                                <div className="flex justify-between pt-2">
                                  <span className="text-base font-extrabold">TOTAL</span>
                                  <span className="text-xl font-extrabold text-primary">€{Number(q.total_amount).toLocaleString()}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardContent className="p-4 flex justify-between">
                              <div>
                                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Assigned Engineer</p>
                                <p className="text-sm font-bold">👷 {q.service_calls?.assigned_engineer || "Unassigned"}</p>
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Job Type</p>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${jt}`}>{q.service_calls?.job_type}</span>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Notes */}
                          <Card>
                            <CardContent className="p-4">
                              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Notes</p>
                              {q.notes ? (
                                <p className="text-sm">{q.notes}</p>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">No notes</p>
                              )}
                            </CardContent>
                          </Card>

                          {q.payment_link && (
                            <div className="flex items-center gap-2 text-xs text-success font-semibold p-3 bg-success/10 rounded-lg">
                              💳 Payment link attached
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Timeline Tab */}
                  {tab === "timeline" && (
                    <div className="space-y-4">
                      <div className="space-y-0">
                        {timeline.map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center w-5">
                              <div className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${step.done ? "bg-primary ring-4 ring-primary/10" : "bg-border"}`} />
                              {i < 3 && <div className={`w-0.5 flex-1 my-1 min-h-[24px] ${step.done ? "bg-primary/20" : "bg-border"}`} />}
                            </div>
                            <div className="pb-4">
                              <p className={`text-sm ${step.done ? "font-bold" : "text-muted-foreground"}`}>{step.label}</p>
                              <p className="text-xs text-muted-foreground">{step.time || (step.done ? "Completed" : "Not yet")}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Card className={ss.bg}>
                        <CardContent className="p-4">
                          <p className={`text-sm font-bold ${ss.text}`}>Current status: {q.status}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {q.status === "Draft" && "Quote saved. Not yet sent to customer."}
                            {q.status === "Sent" && "Awaiting customer approval."}
                            {q.status === "Accepted" && "Customer approved. Awaiting payment."}
                            {q.status === "Paid" && "Quote fully settled. Job complete."}
                            {q.status === "Rejected" && "Customer declined this quote."}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Actions Tab */}
                  {tab === "actions" && (
                    <div className="space-y-3">
                      {q.status === "Draft" && (
                        <>
                          <Button className="w-full justify-center" onClick={() => openWhatsApp(q)}>
                            <MessageCircle className="w-4 h-4 mr-2" /> Send via WhatsApp
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={async () => {
                            const phone = q.customers.phone.replace(/\D/g, "");
                            const fp = phone.startsWith("353") ? phone : "353" + phone.replace(/^0/, "");
                            const { data: orgRow } = await supabase
                              .from("quotes")
                              .select("organisations(slug)")
                              .eq("id", q.id)
                              .maybeSingle();
                            const slug = (orgRow as any)?.organisations?.slug || "kngasservices";
                            const quoteLink = `https://${slug}.bookedjobs.ie/quote/${q.quote_number || q.id}`;
                            const sub = encodeURIComponent(`Your Quote from Karl's Gas — €${Number(q.total_amount).toFixed(2)}`);
                            const body = encodeURIComponent(`Hi ${q.customers.name},\n\nHere is your quote: ${quoteLink}\n\nTotal: €${Number(q.total_amount).toFixed(2)}\n\nKarl's Gas 🔥`);
                            window.open(`mailto:${q.customers.email}?subject=${sub}&body=${body}`, "_blank");
                            updateStatus(q.id, "Sent", { sent_at: new Date().toISOString() });
                          }}>
                            📧 Send via Email
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => navigate(`/jobs/${q.job_id}`)}>
                            <Edit2 className="w-4 h-4 mr-2" /> Edit Quote
                          </Button>
                        </>
                      )}

                      {q.status === "Sent" && (
                        <>
                          <Button className="w-full justify-center bg-success hover:bg-success/90" onClick={() => updateStatus(q.id, "Accepted", { accepted_at: new Date().toISOString() })}>
                            🧾 Mark as Accepted
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => openWhatsApp(q)}>
                            <MessageCircle className="w-4 h-4 mr-2" /> Resend via WhatsApp
                          </Button>
                          <Button variant="outline" className="w-full justify-center text-destructive hover:text-destructive" onClick={() => updateStatus(q.id, "Rejected")}>
                            <X className="w-4 h-4 mr-2" /> Mark as Rejected
                          </Button>
                        </>
                      )}

                      {q.status === "Accepted" && (
                        <>
                          <Button
                            className="w-full justify-center bg-success hover:bg-success/90 text-success-foreground font-bold gap-2"
                            onClick={() => {
                              setScheduleDate(undefined);
                              setScheduleTime("");
                              setScheduleEngineer("");
                              setScheduleErrors({});
                              setScheduleOpen(true);
                            }}
                          >
                            <CalendarIcon className="w-4 h-4" /> Schedule Job →
                          </Button>
                          <Button className="w-full justify-center" variant="outline" onClick={() => openPay(q)}>
                            <CreditCard className="w-4 h-4 mr-2" /> Add Payment Link
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => updateStatus(q.id, "Paid", { paid_at: new Date().toISOString() })}>
                            ✅ Mark as Paid
                          </Button>
                        </>
                      )}

                      {q.status === "Paid" && (
                        <Card className="bg-success/10">
                          <CardContent className="p-6 text-center">
                            <p className="text-3xl mb-2">🎉</p>
                            <p className="font-bold text-success">Quote fully paid</p>
                            <p className="text-sm text-muted-foreground mt-1">€{Number(q.total_amount).toLocaleString()} received</p>
                          </CardContent>
                        </Card>
                      )}

                      {q.status === "Rejected" && (
                        <Card className="bg-destructive/10">
                          <CardContent className="p-6 text-center">
                            <p className="text-3xl mb-2">✕</p>
                            <p className="font-bold text-destructive">Customer declined</p>
                            <p className="text-sm text-muted-foreground mt-1">Follow up via WhatsApp</p>
                          </CardContent>
                        </Card>
                      )}

                      {q.converted_job_id && (
                        <Button className="w-full justify-center" onClick={() => navigate(`/jobs/${q.converted_job_id}`)}>
                          📋 View Job
                        </Button>
                      )}

                      <Button variant="outline" className="w-full justify-center" onClick={() => navigate(`/customers/${q.customer_id}`)}>
                        <User className="w-4 h-4 mr-2" /> View Customer Profile
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Schedule Job Modal ── */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule This Job</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted rounded-xl p-3">
                <p className="text-sm font-bold">{selected.customers.name}</p>
                <p className="text-xs text-muted-foreground">{selected.service_calls?.job_type || "Job"} · €{Number(selected.total_amount).toLocaleString()}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !scheduleDate && "text-muted-foreground",
                        scheduleErrors.date && validationBorderClass(true)
                      )}
                    >
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {scheduleDate ? format(scheduleDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduleDate}
                      onSelect={(d) => { setScheduleDate(d); setScheduleErrors(e => ({ ...e, date: false })); }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <ValidationMessage show={!!scheduleErrors.date} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Slot *</Label>
                <Select value={scheduleTime} onValueChange={(v) => { setScheduleTime(v); setScheduleErrors(e => ({ ...e, time: false })); }}>
                  <SelectTrigger className={validationBorderClass(!!scheduleErrors.time)}>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_BLOCKS.map(tb => (
                      <SelectItem key={tb.id} value={tb.id}>{tb.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ValidationMessage show={!!scheduleErrors.time} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Engineer *</Label>
                <Select value={scheduleEngineer} onValueChange={(v) => { setScheduleEngineer(v); setScheduleErrors(e => ({ ...e, engineer: false })); }}>
                  <SelectTrigger className={validationBorderClass(!!scheduleErrors.engineer)}>
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ValidationMessage show={!!scheduleErrors.engineer} />
              </div>

              <Button
                className="w-full h-12 font-extrabold bg-success hover:bg-success/90 text-success-foreground"
                onClick={handleScheduleJob}
                disabled={scheduleSaving}
              >
                {scheduleSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Confirm & Create Job
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setScheduleOpen(false)}>
                Cancel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Send Dialog ── */}
      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send via WhatsApp</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{selected.customers.name} · {selected.customers.phone}</p>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[180px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={whatsappMsg}
                onChange={(e) => setWhatsappMsg(e.target.value)}
              />
              <p className="text-xs text-muted-foreground text-right">Edit before sending ↑</p>
              <Button className="w-full" onClick={() => sendWhatsApp(selected)} disabled={whatsappSending}>
                {whatsappSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : "📲 Send via WhatsApp"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setWhatsappOpen(false)}>Cancel</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Payment Link Dialog ── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Link</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Payment URL</Label>
                <Input value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://buy.stripe.com/..." />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Payment Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPayType("full")}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                      payType === "full" ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
                    }`}
                  >
                    Full €{Number(selected.total_amount).toLocaleString()}
                  </button>
                  <button
                    onClick={() => setPayType("deposit")}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                      payType === "deposit" ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
                    }`}
                  >
                    Deposit only
                  </button>
                </div>
              </div>
              {payType === "deposit" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Deposit Amount</Label>
                  <Input type="number" value={payDeposit} onChange={(e) => setPayDeposit(e.target.value)} placeholder="€" />
                </div>
              )}
              <Button className="w-full bg-success hover:bg-success/90" onClick={() => savePay(selected)}>💳 Save Payment Link</Button>
              <Button variant="outline" className="w-full" onClick={() => setPayOpen(false)}>Cancel</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Quote Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => {
        if (!o && (formCustomerId || formJobId || formDesc.trim() || formTotal.trim())) {
          setShowCreateLeaveGuard(true);
        } else {
          setCreateOpen(o);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Customer</Label>
              <Select value={formCustomerId} onValueChange={(v) => { onCustomerSelect(v); setCreateFormErrors(e => ({ ...e, customer: false })); }}>
                <SelectTrigger className={validationBorderClass(!!createFormErrors.customer)}><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ValidationMessage show={!!createFormErrors.customer} />
            </div>

            {formCustomerId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Job</Label>
                <Select value={formJobId} onValueChange={(v) => { setFormJobId(v); setCreateFormErrors(e => ({ ...e, job: false })); }}>
                  <SelectTrigger className={validationBorderClass(!!createFormErrors.job)}><SelectValue placeholder="Select job..." /></SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.job_type} — {j.scheduled_date ? new Date(j.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Unscheduled"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ValidationMessage show={!!createFormErrors.job} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Job Description *</Label>
              <Input value={formDesc} onChange={(e) => { setFormDesc(e.target.value); setCreateFormErrors(er => ({ ...er, description: false })); }} placeholder="e.g. Replace faulty burner unit" className={validationBorderClass(!!createFormErrors.description)} />
              <ValidationMessage show={!!createFormErrors.description} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Parts / Materials (optional)</Label>
              <Input value={formParts} onChange={(e) => setFormParts(e.target.value)} placeholder="e.g. Burner unit, ignition lead" />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <span className="text-sm font-semibold">Show price breakdown</span>
              <Switch checked={showBreakdown} onCheckedChange={setShowBreakdown} />
            </div>

            {showBreakdown ? (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Parts €", val: formPartsCost, set: setFormPartsCost },
                  { label: "Labour €", val: formLabourCost, set: setFormLabourCost },
                  { label: "Call-Out €", val: formCalloutCost, set: setFormCalloutCost },
                ].map((f) => (
                  <div key={f.label} className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase text-muted-foreground">{f.label}</Label>
                    <Input type="number" value={f.val} onChange={(e) => f.set(e.target.value)} placeholder="0" className="text-right" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Total Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">€</span>
                  <Input value={formTotal} onChange={(e) => { setFormTotal(e.target.value); setCreateFormErrors(er => ({ ...er, total: false })); }} placeholder="0.00" className={`pl-8 text-lg font-bold ${validationBorderClass(!!createFormErrors.total)}`} type="number" />
                </div>
                <ValidationMessage show={!!createFormErrors.total} />
              </div>
            )}

            {showBreakdown && calcTotal > 0 && (
              <p className="text-right text-sm font-bold">Total: €{calcTotal.toFixed(2)}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleCreate(false)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                💾 Save Draft
              </Button>
              <Button className="flex-1" onClick={() => handleCreate(true)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                📲 Send Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send All Quotes Sheet */}
      <SendAllQuotesSheet
        open={sendAllOpen}
        onOpenChange={setSendAllOpen}
        quotes={unsentQuotes}
        onQuoteSent={handleQuoteSent}
      />

      {/* Resend Prompt after editing a Sent quote */}
      <Dialog open={resendPromptOpen} onOpenChange={(v) => { if (!v) { setResendPromptOpen(false); setResendQuoteData(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resend Quote?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This quote has already been sent. Would you like to resend it to the customer via WhatsApp?
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setResendPromptOpen(false); setResendQuoteData(null); }}>
              No thanks
            </Button>
            <Button className="flex-1 gap-1.5" onClick={handleResend}>
              <MessageCircle className="w-4 h-4" /> Resend via WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Modal for in-page actions (back button, clicking another quote) */}
      <FormLeaveGuard
        open={!!pendingAction}
        onKeepEditing={() => setPendingAction(null)}
        onLeave={() => {
          const action = pendingAction;
          setPendingAction(null);
          action?.();
        }}
      />

      {/* Leave guard for Create Quote dialog */}
      <FormLeaveGuard
        open={showCreateLeaveGuard}
        onKeepEditing={() => setShowCreateLeaveGuard(false)}
        onLeave={() => { setShowCreateLeaveGuard(false); setCreateOpen(false); }}
      />
    </div>
  );
};

export default Quotes;
