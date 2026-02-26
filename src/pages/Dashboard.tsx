import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus, Loader2 } from "lucide-react";
import NewJobPanel from "@/components/jobs/NewJobPanel";
import { useBackButton } from "@/hooks/useBackButton";
import { format } from "date-fns";

import WeekSnapshot from "@/components/dashboard/WeekSnapshot";
import LiveActivityFeed from "@/components/dashboard/LiveActivityFeed";
import TodayTimeline from "@/components/dashboard/TodayTimeline";
import RevenueSnapshot from "@/components/dashboard/RevenueSnapshot";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import RenewalsCard from "@/components/dashboard/RenewalsCard";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const titleCase = (str: string) =>
  str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewJob, setShowNewJob] = useState(false);
  const closeNewJob = useCallback(() => setShowNewJob(false), []);
  useBackButton(showNewJob, closeNewJob);

  // Profile name
  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const displayName = titleCase(profile?.display_name?.split("@")[0]?.split(" ")[0] || "there");

  // Realtime refresh for all dashboard queries
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dashboard-main-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpi"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-timeline"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-revenue-snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-alerts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-team-jobs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {greeting()}, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {format(new Date(), "EEEE d MMMM yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/schedule")}>
            <CalendarDays className="w-4 h-4 mr-1.5" /> Schedule
          </Button>
          <Button onClick={() => setShowNewJob(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Job
          </Button>
        </div>
      </div>

      {/* Section 1: Revenue + Today's Jobs (2-col on desktop, stacked on mobile — Today first on mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="order-2 md:order-1">
          <RevenueSnapshot />
        </div>
        <div className="order-1 md:order-2">
          <TodayTimeline />
        </div>
      </div>

      {/* Section 2: Weekly strip */}
      <WeekSnapshot />

      {/* Section 3: Live Activity + Renewals Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LiveActivityFeed />
        <RenewalsCard />
      </div>

      {/* Section 4: Needs Attention */}
      <AlertsPanel />

      {showNewJob && <NewJobPanel onClose={() => setShowNewJob(false)} />}
    </div>
  );
};

export default Dashboard;