import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { addDays } from "date-fns";
import { SERVICE_CALL_BASE_SELECT, type ServiceCall } from "@/types/service-calls";

const todayISO = () => new Date().toISOString().split("T")[0];

const TIME_ORDER: Record<string, number> = {
  "9–11": 1, "9am–11am": 1,
  "11–2": 2, "11am–1pm": 2,
  "2–5": 3, "2pm–5pm": 3, "Afternoon": 3,
};

export const sortByTime = (arr: ServiceCall[]) =>
  [...arr].sort((a, b) => (TIME_ORDER[a.time_block] || 99) - (TIME_ORDER[b.time_block] || 99));

const TIME_RANGES: Record<string, [number, number]> = {
  "9–11": [9, 11], "9am–11am": [9, 11],
  "11–2": [11, 14], "11am–1pm": [11, 14],
  "2–5": [14, 17], "2pm–5pm": [14, 17], "Afternoon": [14, 17],
};

export const getNextJobId = (jobs: ServiceCall[]): string | null => {
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
  const [todayJobs, setTodayJobs] = useState<ServiceCall[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<ServiceCall[]>([]);
  const [completedJobs, setCompletedJobs] = useState<ServiceCall[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [jobPhotos, setJobPhotos] = useState<Record<string, { url: string; name: string; type?: string }[]>>({});
  const [engineerName, setEngineerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Track cancelled jobs that should fade out after 10 seconds
  const [fadingJobIds, setFadingJobIds] = useState<Set<string>>(new Set());
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchCustomers = useCallback(async (jobs: ServiceCall[]) => {
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

  const fetchJobPhotos = useCallback(async (jobs: ServiceCall[]) => {
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

  const fetchAll = useCallback(async () => {
    if (!user) return;
    // Skip network requests when offline to avoid error modals/toasts
    if (!navigator.onLine) return;
    setLoading(true);

    // First resolve the engineer record for this auth user
    const { data: engData } = await supabase
      .from("engineers")
      .select("id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (engData?.name) setEngineerName(engData.name);

    const engineerId = engData?.id;

    // Build queries — explicitly filter by assigned_engineer_id for reliability
    let todayQuery = supabase.from("service_calls").select(SERVICE_CALL_BASE_SELECT).eq("scheduled_date", todayISO()).order("created_at");
    let upcomingQuery = supabase.from("service_calls").select(SERVICE_CALL_BASE_SELECT).gt("scheduled_date", todayISO()).in("status", ["Scheduled", "Booked", "En Route", "On Site", "In Progress"]).order("scheduled_date").limit(20);
    let completedQuery = supabase.from("service_calls").select(SERVICE_CALL_BASE_SELECT).eq("status", "Completed").order("updated_at", { ascending: false }).limit(30);

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

    const allJobs = [...(todayRes.data || []), ...(upcomingRes.data || []), ...(completedRes.data || [])];
    setTodayJobs(todayRes.data || []);
    setUpcomingJobs(upcomingRes.data || []);
    setCompletedJobs(completedRes.data || []);
    await fetchCustomers(allJobs);
    await fetchJobPhotos(allJobs);
    setLoading(false);
  }, [user, fetchCustomers, fetchJobPhotos]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  const updateJob = async (jobId: string, patch: Record<string, any>) => {
    if (!navigator.onLine) {
      toast({ title: "You're offline", description: "Reconnect to save changes.", variant: "destructive" });
      return;
    }
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, cancelReason, cancelNote, paymentMethod, selectedTags, ...rest } = patch;

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

    const dbPatch: Record<string, any> = { ...rest };
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;
    if (paymentMethod) {
      dbPatch.payment_method = paymentMethod;
      dbPatch.paid_at = new Date().toISOString();
      dbPatch.payment_collected_by = user?.id || null;
    }
    if (cancelReason) {
      dbPatch.cancellation_reason = cancelReason;
      dbPatch.cancellation_note = cancelNote || null;
      dbPatch.cancelled_at = new Date().toISOString();
      dbPatch.cancelled_by = user?.id || null;
    }

    // Set completed_at and generate receipt number on completion
    if (patch.status === "Completed") {
      dbPatch.completed_at = new Date().toISOString();
      if (paymentMethod === "invoice") {
        dbPatch.invoiced_at = new Date().toISOString();
      }
      try {
        const job = [...todayJobs, ...upcomingJobs].find(j => j.id === jobId);
        const ownerId = job?.user_id;
        if (ownerId) {
          const { data: receiptNum } = await supabase.rpc("generate_receipt_number", { p_user_id: ownerId });
          if (receiptNum) dbPatch.receipt_number = receiptNum;
        }
      } catch {}
    }

    const { error } = await supabase.from("service_calls").update(dbPatch).eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const updater = (prev: any[]) => prev.map((j) => (j.id === jobId ? { ...j, ...dbPatch } : j));
      setTodayJobs(updater);
      setUpcomingJobs(updater);
      setCompletedJobs(updater);

      if (patch.status === "Completed") {
        // Save selected tags to service_call_tags
        if (selectedTags && selectedTags.length > 0) {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", user!.id)
              .maybeSingle();

            const profileId = profile?.id || null;

            const { data: tagRows } = await supabase
              .from("job_tags")
              .select("id, name")
              .in("name", selectedTags);

            if (tagRows && tagRows.length > 0) {
              const { data: existing } = await supabase
                .from("service_call_tags")
                .select("tag_id")
                .eq("service_call_id", jobId);

              const existingIds = new Set((existing || []).map((e: any) => e.tag_id));

              const inserts = tagRows
                .filter((t: any) => !existingIds.has(t.id))
                .map((t: any) => ({
                  service_call_id: jobId,
                  tag_id: t.id,
                  added_by: profileId,
                }));

              if (inserts.length > 0) {
                await supabase.from("service_call_tags").insert(inserts as any);
              }
            }
          } catch (e) {
            console.error("Failed to save job tags:", e);
          }
        }
        toast({ title: "Job completed ✔" });
        navigate(`/receipt/${jobId}`);
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
      if (document.visibilityState === "visible" && user && navigator.onLine) fetchAll();
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
