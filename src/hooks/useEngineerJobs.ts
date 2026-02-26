import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { addDays } from "date-fns";

const todayISO = () => new Date().toISOString().split("T")[0];

const TIME_ORDER: Record<string, number> = { "9–11": 1, "11–2": 2, "2–5": 3 };

export const sortByTime = (arr: any[]) =>
  [...arr].sort((a, b) => (TIME_ORDER[a.time_block] || 99) - (TIME_ORDER[b.time_block] || 99));

const TIME_RANGES: Record<string, [number, number]> = {
  "9–11": [9, 11],
  "11–2": [11, 14],
  "2–5": [14, 17],
};

export const getNextJobId = (jobs: any[]): string | null => {
  if (jobs.length === 0) return null;
  const hour = new Date().getHours();
  const blockOrder = ["9–11", "11–2", "2–5"];

  for (const block of blockOrder) {
    const [, end] = TIME_RANGES[block];
    if (hour < end) {
      const match = jobs.find(j => j.time_block === block && !["Completed", "Cancelled"].includes(j.status));
      if (match) return match.id;
    }
  }

  const fallback = jobs.find(j => !["Completed", "Cancelled"].includes(j.status));
  return fallback?.id || null;
};

export const useEngineerJobs = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [todayJobs, setTodayJobs] = useState<any[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

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

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [todayRes, upcomingRes, completedRes] = await Promise.all([
      supabase.from("service_calls").select("*").eq("scheduled_date", todayISO()).order("created_at"),
      supabase.from("service_calls").select("*").gt("scheduled_date", todayISO()).in("status", ["Scheduled", "Booked"]).order("scheduled_date").limit(20),
      supabase.from("service_calls").select("*").eq("status", "Completed").order("updated_at", { ascending: false }).limit(30),
    ]);

    const allJobs = [...(todayRes.data || []), ...(upcomingRes.data || []), ...(completedRes.data || [])];
    setTodayJobs(todayRes.data || []);
    setUpcomingJobs(upcomingRes.data || []);
    setCompletedJobs(completedRes.data || []);
    await fetchCustomers(allJobs);
    setLoading(false);
  }, [user, fetchCustomers]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  const updateJob = async (jobId: string, patch: Record<string, any>) => {
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, cancelReason, cancelNote, ...rest } = patch;

    let notesUpdate = rest.notes;
    if (workDone) {
      notesUpdate = `Work done: ${workDone}${parts ? `\nParts: ${parts}` : ""}${officeNote ? `\nOffice note: ${officeNote}` : ""}${followUp ? `\nFollow-up: ${followUpNote}` : ""}`;
    }
    if (cancelReason) {
      notesUpdate = `Cancelled: ${cancelReason}${cancelNote ? `\nNote: ${cancelNote}` : ""}`;
    }

    const dbPatch: Record<string, any> = { ...rest };
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;
    if (cancelReason) {
      dbPatch.cancellation_reason = cancelReason;
      dbPatch.cancellation_note = cancelNote || null;
      dbPatch.cancelled_at = new Date().toISOString();
      dbPatch.cancelled_by = user?.id || null;
    }

    const { error } = await supabase.from("service_calls").update(dbPatch).eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const updater = (prev: any[]) => prev.map((j) => (j.id === jobId ? { ...j, ...dbPatch } : j));
      setTodayJobs(updater);
      setUpcomingJobs(updater);
      setCompletedJobs(updater);
      toast({ title: patch.status === "Completed" ? "Job completed ✔" : patch.status === "Cancelled" ? "Job cancelled" : "Updated" });
    }
  };

  // Derived today data
  const todayActive = sortByTime(todayJobs.filter((j) => j.status !== "Completed" && j.status !== "Cancelled"));
  const todayCompleted = sortByTime(todayJobs.filter((j) => j.status === "Completed"));
  const todayCancelled = sortByTime(todayJobs.filter((j) => j.status === "Cancelled"));
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
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

  return {
    user, authLoading, loading,
    todayActive, todayCompleted, todayCancelled, todayInProgress,
    upcomingJobs, completedJobs, customers,
    updateJob, fetchAll,
  };
};
