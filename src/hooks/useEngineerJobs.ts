import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import { createJobInvoice } from "@/lib/createJobInvoice";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

const todayISO = () => new Date().toISOString().split("T")[0];

const TIME_ORDER: Record<string, number> = {
  "9–11": 1, "9am–11am": 1,
  "11–2": 2, "11am–1pm": 2,
  "2–5": 3, "2pm–5pm": 3, "Afternoon": 3,
};

export const sortByTime = (arr: any[]) =>
  [...arr].sort((a, b) => (TIME_ORDER[a.time_block] || 99) - (TIME_ORDER[b.time_block] || 99));

const TIME_RANGES: Record<string, [number, number]> = {
  "9–11": [9, 11], "9am–11am": [9, 11],
  "11–2": [11, 14], "11am–1pm": [11, 14],
  "2–5": [14, 17], "2pm–5pm": [14, 17], "Afternoon": [14, 17],
};

export const getNextJobId = (jobs: any[]): string | null => {
  if (jobs.length === 0) return null;
  const hour = new Date().getHours();
  const uniqueBlocks = ["9am–11am", "11am–1pm", "2pm–5pm"];

  for (const block of uniqueBlocks) {
    const [, end] = TIME_RANGES[block];
    if (hour < end) {
      const match = jobs.find(j => (j.time_block === block || TIME_ORDER[j.time_block] === TIME_ORDER[block]) && !["Completed", "Cancelled"].includes(j.status));
      if (match) return match.id;
    }
  }

  const fallback = jobs.find(j => !["Completed", "Cancelled"].includes(j.status));
  return fallback?.id || null;
};

export const useEngineerJobs = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isOnline } = useNetworkStatus();
  const [todayJobs, setTodayJobs] = useState<any[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [jobPhotos, setJobPhotos] = useState<Record<string, { url: string; name: string; type?: string }[]>>({});
  const [engineerName, setEngineerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Track cancelled jobs that should fade out after 10 seconds
  const [fadingJobIds, setFadingJobIds] = useState<Set<string>>(new Set());
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchCustomers = useCallback(async (jobs: any[]) => {
    const ids = [...new Set(jobs.map((j) => j.customer_id))];
    if (ids.length === 0) return;
    const { data } = await supabase.from("customers").select("*").in("id", ids);
    if (data) {
      setCustomers((prev) => {
        const map = { ...prev };
        data.forEach((c: any) => { map[c.id] = c; });
        return map;
      });
    }
  }, []);

  const fetchJobPhotos = useCallback(async (jobs: any[]) => {
    const ids = jobs.map((j) => j.id);
    if (ids.length === 0) return;
    const { data } = await supabase.from("job_media").select("job_id, public_url, file_name, file_type").in("job_id", ids);
    if (data) {
      const map: Record<string, { url: string; name: string; type?: string }[]> = {};
      data.forEach((m: any) => {
        if (!m.public_url) return;
        if (!map[m.job_id]) map[m.job_id] = [];
        map[m.job_id].push({ url: m.public_url, name: m.file_name, type: m.file_type || undefined });
      });
      setJobPhotos((prev) => ({ ...prev, ...map }));
    }
  }, []);

  const hasFetchedOnce = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    // Skip network requests when offline to avoid error modals/toasts
    if (!isOnline) return;
    // Only show loading spinner on the very first fetch to avoid scroll resets
    if (!hasFetchedOnce.current) setLoading(true);

    // First resolve the engineer record for this auth user
    const { data: engData } = await supabase
      .from("engineers")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (engData?.name) setEngineerName(engData.name);

    const engineerId = engData?.id;

    console.log("[DEBUG] Engineer lookup:", { auth_user_id: user.id, engineerId, engineerName: engData?.name });
    console.log("[DEBUG] Today query filters: scheduled_date =", todayISO(), "| status != Completed | engineer_id =", engineerId || "NOT FILTERED");
    console.log("[DEBUG] Upcoming query filters: scheduled_date >", todayISO(), '| statuses: ["Scheduled","Booked","En Route","On Site","In Progress","parts_needed","parts_ordered","parts_arrived"] | engineer_id =', engineerId || "NOT FILTERED");
    console.log("[DEBUG] Completed query: status = Completed, limit 30 | engineer_id =", engineerId || "NOT FILTERED");

    // Build queries — explicitly filter by assigned_engineer_id for reliability
    let todayQuery = supabase
      .from("service_calls")
      .select("*")
      .eq("scheduled_date", todayISO())
      .neq("status", "Completed")
      .order("created_at");
    let upcomingQuery = supabase.from("service_calls").select("*").gt("scheduled_date", todayISO()).in("status", ["Scheduled", "Booked", "En Route", "On Site", "In Progress", "parts_needed", "parts_ordered", "parts_arrived"]).order("scheduled_date").limit(20);
    let completedQuery = supabase.from("service_calls").select("*").eq("status", "Completed").order("updated_at", { ascending: false }).limit(30);

    if (engineerId) {
      todayQuery = todayQuery.eq("assigned_engineer_id", engineerId);
      upcomingQuery = upcomingQuery.eq("assigned_engineer_id", engineerId);
      completedQuery = completedQuery.eq("assigned_engineer_id", engineerId);
    }

    const [todayRes, upcomingRes, completedRes] = await Promise.all([
      todayQuery,
      upcomingQuery,
      completedQuery,
    ]);

    console.log("[DEBUG] Today jobs returned:", (todayRes.data || []).length, (todayRes.data || []).map((j: any) => ({ id: j.id, ref: j.job_reference, status: j.status, engineer_id: j.assigned_engineer_id })));
    console.log("[DEBUG] Upcoming jobs returned:", (upcomingRes.data || []).length, (upcomingRes.data || []).map((j: any) => ({ id: j.id, ref: j.job_reference, status: j.status, engineer_id: j.assigned_engineer_id })));
    console.log("[DEBUG] Completed jobs returned:", (completedRes.data || []).length, (completedRes.data || []).map((j: any) => ({ id: j.id, ref: j.job_reference, status: j.status, engineer_id: j.assigned_engineer_id })));
    if (todayRes.error) console.error("[DEBUG] Today query error:", todayRes.error);
    if (upcomingRes.error) console.error("[DEBUG] Upcoming query error:", upcomingRes.error);
    if (completedRes.error) console.error("[DEBUG] Completed query error:", completedRes.error);

    const allJobs = [...(todayRes.data || []), ...(upcomingRes.data || []), ...(completedRes.data || [])];
    setTodayJobs(todayRes.data || []);
    setUpcomingJobs(upcomingRes.data || []);
    setCompletedJobs(completedRes.data || []);
    await fetchCustomers(allJobs);
    await fetchJobPhotos(allJobs);
    hasFetchedOnce.current = true;
    setLoading(false);
  }, [user, fetchCustomers, fetchJobPhotos, isOnline]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  const debugLog = async (event: string, payload?: Record<string, any>, stack?: string) => {
    try {
      await supabase.from('debug_logs').insert({
        engineer_id: user?.id ?? null,
        job_id: payload?.job_id ?? null,
        event,
        payload: payload ?? {},
        stack: stack ?? null,
      });
    } catch (e) {
      console.warn('[debugLog] insert failed', e);
    }
  };

  const updateJob = async (jobId: string, patch: Record<string, any>, options?: { jobTagDate?: string | null }) => {
    // debug logging removed — debugLog helper kept for future use
    // Save scroll position before any state changes to prevent iOS jump
    const scrollY = window.scrollY;

    if (!isOnline) {
      toast({ title: "You're offline", description: "Reconnect to save changes.", variant: "destructive" });
      return;
    }
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, cancelReason, cancelNote, paymentMethod, selectedTags, selectedJobType, confirmedRevenue, ...rest } = patch;
    const completionSelectedTags = Array.isArray(selectedTags) ? selectedTags : [];

    let notesUpdate = rest.notes;
    if (workDone) {
      notesUpdate = `Work done: ${workDone}${parts ? `\nParts: ${parts}` : ""}${officeNote ? `\nOffice note: ${officeNote}` : ""}${followUp ? `\nFollow-up: ${followUpNote}` : ""}`;
    }

    // Wire follow-up toggle to dedicated columns
    if (workDone !== undefined) {
      rest.follow_up_needed = !!followUp;
      rest.follow_up_detail = followUp ? (followUpNote || null) : null;
    }
    if (cancelReason) {
      notesUpdate = `Cancelled: ${cancelReason}${cancelNote ? `\nNote: ${cancelNote}` : ""}`;
    }

    const jobTagDate = options?.jobTagDate ?? null;
    const dbPatch: Record<string, any> = sanitizeServiceCallUpdatePayload({ ...rest });
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;
    if (paymentMethod) {
      dbPatch.payment_method = paymentMethod;
      if (paymentMethod === "invoice") {
        // Invoice = unpaid, no paid_at
        dbPatch.payment_status = "unpaid";
      } else {
        dbPatch.paid_at = new Date().toISOString();
        dbPatch.payment_collected_by = user?.id || null;
        dbPatch.payment_status = "paid";
        dbPatch.balance_due = 0;
      }
    }
    if (cancelReason) {
      dbPatch.cancellation_reason = cancelReason;
      dbPatch.cancellation_note = cancelNote || null;
      dbPatch.cancelled_at = new Date().toISOString();
      dbPatch.cancelled_by = user?.id || null;
    }

    // Set completed_at and generate receipt/invoice number on completion
    if (patch.status === "Completed") {
      dbPatch.completed_at = new Date().toISOString();
      dbPatch.job_tags = completionSelectedTags;
      // Map completion job type selector to DB column
      if (selectedJobType) {
        const jobTypeMap: Record<string, string> = { Service: "Boiler Service", Repair: "Repair", Install: "Install" };
        dbPatch.job_type = jobTypeMap[selectedJobType] || selectedJobType;
      }
      try {
        const job = [...todayJobs, ...upcomingJobs].find(j => j.id === jobId);
        const ownerId = job?.user_id;
        if (paymentMethod === "invoice") {
          dbPatch.invoiced_at = new Date().toISOString();
          // Invoice number will be generated by the create-job-invoice edge function
        }
        if (ownerId) {
          const { data: receiptNum } = await supabase.rpc("generate_receipt_number", { p_user_id: ownerId });
          if (receiptNum) dbPatch.receipt_number = receiptNum;
        }
      } catch {}
    }

    const safeDbPatch = sanitizeServiceCallUpdatePayload(dbPatch);
    const { error } = await supabase.from("service_calls").update(safeDbPatch).eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Log payment_received activity when payment is recorded as paid
      if (safeDbPatch.payment_status === "paid" && paymentMethod && paymentMethod !== "invoice") {
        try {
          const theJob = [...todayJobs, ...upcomingJobs, ...completedJobs].find(j => j.id === jobId);
          const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
          const methodLabel = paymentMethod === "cash" ? "Cash" : paymentMethod === "card" ? "Card" : paymentMethod;
          const amountVal = safeDbPatch.revenue ?? confirmedRevenue ?? theJob?.revenue ?? 0;
          const amountStr = Number(amountVal).toLocaleString("en-IE", { maximumFractionDigits: 0 });
          await supabase.from("customer_activity").insert({
            organisation_id: theJob?.organisation_id,
            customer_id: theJob?.customer_id,
            service_call_id: jobId,
            event_type: "payment_received",
            event_label: `Payment received — €${amountStr} — ${methodLabel}`,
            created_by: profile?.id || null,
          } as any);
        } catch (e) {
          console.error("Failed to log payment activity:", e);
        }
      }
      const existingJob = [...todayJobs, ...upcomingJobs, ...completedJobs].find((j) => j.id === jobId) || { id: jobId };
      const updatedJob = { ...existingJob, ...safeDbPatch };
      const nextStatus = safeDbPatch.status ?? existingJob.status;
      const inPlaceUpdater = (prev: any[]) => prev.map((j) => (j.id === jobId ? updatedJob : j));
      const removeJob = (prev: any[]) => prev.filter((j) => j.id !== jobId);
      const upsertCompletedJob = (prev: any[]) => [updatedJob, ...prev.filter((j) => j.id !== jobId)];

      if (nextStatus === "Completed") {
        setTodayJobs(removeJob);
        setUpcomingJobs(removeJob);
        setCompletedJobs(upsertCompletedJob);
      } else {
        setTodayJobs(inPlaceUpdater);

        if (["Cancelled", "no_show"].includes(nextStatus)) {
          setUpcomingJobs(removeJob);
        } else {
          setUpcomingJobs(inPlaceUpdater);
        }

        setCompletedJobs(removeJob);
      }

      // Restore scroll position after React state updates to prevent iOS jump
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
      });

      if (patch.status === "Completed") {
        try {
          const { data: existing } = await supabase
            .from("service_call_tags")
            .select("id, tag_id")
            .eq("service_call_id", jobId);

          const existingRows = existing || [];
          const existingIds = new Set(existingRows.map((row: any) => row.tag_id));

          const tagRows = completionSelectedTags.length > 0
            ? (await supabase
                .from("job_tags")
                .select("id, name")
                .in("name", completionSelectedTags)).data || []
            : [];

          const selectedIds = new Set(tagRows.map((row: any) => row.id));
          const linkIdsToDelete = existingRows
            .filter((row: any) => !selectedIds.has(row.tag_id))
            .map((row: any) => row.id);

          if (linkIdsToDelete.length > 0) {
            await supabase.from("service_call_tags").delete().in("id", linkIdsToDelete);
          }

          if (tagRows.length > 0) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", user!.id)
              .maybeSingle();

            const profileId = profile?.id || null;

            const inserts = tagRows
              .filter((row: any) => !existingIds.has(row.id))
              .map((row: any) => ({
                service_call_id: jobId,
                tag_id: row.id,
                added_by: profileId,
              }));

            if (inserts.length > 0) {
              await supabase.from("service_call_tags").insert(inserts as any);
            }
          }
        } catch (e) {
          console.error("Failed to save job tags:", e);
        }

        // Sync completion data to customer record
        try {
          const completedDate = new Date();
          const theJob = [...todayJobs, ...upcomingJobs].find(j => j.id === jobId);
          const engName = engineerName || theJob?.assigned_engineer || "Engineer";

          let nextServiceDate: string | null = null;
          if (nextService) {
            const nsd = new Date(completedDate);
            if (nextService === "6 months") nsd.setMonth(nsd.getMonth() + 6);
            else if (nextService === "12 months") nsd.setMonth(nsd.getMonth() + 12);
            else if (nextService === "18 months") nsd.setMonth(nsd.getMonth() + 18);
            else if (nextService === "2 years") nsd.setFullYear(nsd.getFullYear() + 2);
            nextServiceDate = nsd.toISOString().slice(0, 10);
          }

          const customerUpdate: Record<string, any> = {
            last_service_date: completedDate.toISOString().slice(0, 10),
            last_service_engineer: theJob?.assigned_engineer || null,
            assigned_engineer: theJob?.assigned_engineer || null,
            service_status: "Serviced",
            renewal_stage: "not_contacted",
          };
          if (nextServiceDate) customerUpdate.next_service_due = nextServiceDate;
          customerUpdate.under_warranty = completionSelectedTags.includes("Under Warranty");
          const TAG_WITH_DATE = ["New Boiler Fitted", "New Boiler Soon", "Under Warranty"];
          const matchedTag = completionSelectedTags.find((t: string) => TAG_WITH_DATE.includes(t));
          if (matchedTag && jobTagDate) {
            customerUpdate.job_tag = matchedTag;
            customerUpdate.job_tag_date = jobTagDate;
          }

          // Append engineer notes (parts, office note, tags)
          const dd = String(completedDate.getDate()).padStart(2, "0");
          const mm = String(completedDate.getMonth() + 1).padStart(2, "0");
          const yyyy = completedDate.getFullYear();
          const dateStr = `${dd}/${mm}/${yyyy}`;
          const engNoteParts: string[] = [];
          if (parts && (parts as string).trim()) engNoteParts.push(`Parts: ${(parts as string).trim()}`);
          if (officeNote && (officeNote as string).trim()) engNoteParts.push(`Office note: ${(officeNote as string).trim()}`);
          if (completionSelectedTags.length > 0) {
            let tagStr = `Tags: ${completionSelectedTags.join(", ")}`;
            if (jobTagDate) {
              const [y, m, d] = jobTagDate.split("-");
              tagStr += ` (${d}/${m}/${y})`;
            }
            engNoteParts.push(tagStr);
          }
          if (theJob?.customer_id) {
            const { data: custData } = await supabase
              .from("customers")
              .select("engineer_notes, customer_since")
              .eq("id", theJob.customer_id)
              .maybeSingle();

            // Set customer_since if not already set
            if (!custData?.customer_since) {
              customerUpdate.customer_since = completedDate.toISOString().slice(0, 10);
            }

            if (engNoteParts.length > 0) {
              const engNoteEntry = `${dateStr} — ${engNoteParts.join(". ")}.`;
              const existingEng = custData?.engineer_notes;
              customerUpdate.engineer_notes = existingEng && existingEng.trim()
                ? `${existingEng}\n${engNoteEntry}`
                : engNoteEntry;
            }
          }

          if (theJob?.customer_id) {
            await supabase.from("customers").update(customerUpdate).eq("id", theJob.customer_id);
          }
        } catch (e) {
          console.error("Failed to sync customer profile:", e);
        }

        if (paymentMethod === "invoice") {
          let invoiceCreated = false;
          try {
            console.log("[create-job-invoice] Invoking from useEngineerJobs for job:", jobId);
            await createJobInvoice(jobId);
            invoiceCreated = true;
          } catch (err) {
            console.error("[create-job-invoice] error:", err);
            toast({
              title: "Job completed but invoice creation failed",
              description: "Please create the invoice manually from the office.",
              variant: "destructive",
            });
          }
          if (invoiceCreated) {
            toast({ title: "Job completed & invoice created" });
          }
          navigate(`/invoice-view/${jobId}`);
        } else {
          toast({ title: "Job completed ✔" });
          supabase.functions.invoke('send-whatsapp-receipt', {
            body: { job_id: jobId }
          }).catch((err) => {
            console.warn('[WhatsApp] Receipt send failed:', err);
          });
          navigate(`/receipt-view/${jobId}`);
        }
      } else if (patch.status === "Cancelled") {
        toast({ title: "Job cancelled" });
        // Start 10-second fade-out timer
        if (!fadeTimers.current[jobId]) {
          // After 7s, start CSS fade animation
          fadeTimers.current[jobId] = setTimeout(() => {
            setFadingJobIds(prev => new Set(prev).add(jobId));
            // After 3s fade animation, fully hide
            setTimeout(() => {
              setHiddenJobIds(prev => new Set(prev).add(jobId));
              setFadingJobIds(prev => {
                const next = new Set(prev);
                next.delete(jobId);
                return next;
              });
              delete fadeTimers.current[jobId];
            }, 3000);
          }, 7000);
        }
      } else {
        toast({ title: "Updated" });
      }
    }
  };

  // Derived today data
  const todayActive = sortByTime(todayJobs.filter((j) => j.status !== "Completed" && j.status !== "Cancelled"));
  const todayCompleted = sortByTime(todayJobs.filter((j) => j.status === "Completed"));
  const todayCancelled = sortByTime(todayJobs.filter((j) => j.status === "Cancelled" && !hiddenJobIds.has(j.id)));
  const todayInProgress = todayJobs.filter((j) => ["En Route", "On Site", "In Progress"].includes(j.status));

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("engineer-jobs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_calls" }, () => {
        fetchAll();
      })
      .subscribe();

    // Also listen for notification inserts — ensures we refetch when a new_job
    // notification arrives even if the service_calls realtime event is filtered by RLS
    const notifChannel = supabase
      .channel("engineer-jobs-notif-trigger")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_user_id=eq.${user.id}`,
      }, (payload) => {
        const type = (payload.new as any)?.notification_type;
        if (["new_job", "reassigned", "cancelled"].includes(type)) {
          fetchAll();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(notifChannel);
    };
  }, [user, fetchAll]);

  // Refetch when tab becomes visible (engineer returning to app)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user && isOnline) fetchAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    // Re-fetch when coming back online so data is fresh
    const handleOnline = () => { if (user) fetchAll(); };
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [user, fetchAll]);

  return {
    user, authLoading, loading, engineerName,
    todayActive, todayCompleted, todayCancelled, todayInProgress,
    upcomingJobs, completedJobs, customers, jobPhotos,
    updateJob, fetchAll, fadingJobIds,
  };
};

export type EngineerJobsState = ReturnType<typeof useEngineerJobs>;
