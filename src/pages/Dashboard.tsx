import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus, Loader2, AlertTriangle, Package } from "lucide-react";
import NewJobPanel from "@/components/jobs/NewJobPanel";
import { useBackButton } from "@/hooks/useBackButton";
import { format } from "date-fns";

import DashboardStatCards from "@/components/dashboard/DashboardStatCards";
import TodayTimeline from "@/components/dashboard/TodayTimeline";
import NeedsAttentionCard from "@/components/dashboard/NeedsAttentionCard";
import TodaysRevenueCard from "@/components/dashboard/TodaysRevenueCard";
import JobsUpdateSection from "@/components/dashboard/JobsUpdateSection";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import FollowUpsPanel from "@/components/dashboard/FollowUpsPanel";
import PartsPanel from "@/components/dashboard/PartsPanel";

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

const TABS = [
  { key: "dashboard" as const, label: "Dashboard", icon: null as any },
  { key: "follow-ups" as const, label: "Follow-ups", icon: AlertTriangle },
  { key: "parts" as const, label: "Parts", icon: Package },
];

type TabKey = (typeof TABS)[number]["key"];

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [showNewJob, setShowNewJob] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const closeNewJob = useCallback(() => setShowNewJob(false), []);
  useBackButton(showNewJob, closeNewJob);

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

  const { data: followUpCount = 0 } = useQuery({
    queryKey: ["follow-up-count", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("service_calls")
        .select("id", { count: "exact", head: true })
        .eq("follow_up_needed", true)
        .eq("follow_up_resolved", false);
      return count || 0;
    },
    enabled: !!user,
  });

  const { data: partsCount = 0 } = useQuery({
    queryKey: ["parts-count", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("service_calls")
        .select("id", { count: "exact", head: true })
        .not("parts_status", "is", null)
        .not("parts_status", "eq", "Fitted");
      return count || 0;
    },
    enabled: !!user,
  });

  const displayName = titleCase(profile?.display_name?.split("@")[0]?.split(" ")[0] || "there");

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 sm:space-y-6">
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors ${
                active
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
              {tab.key === "follow-ups" && followUpCount > 0 && (
                <span className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] bg-warning text-warning-foreground">
                  {followUpCount}
                </span>
              )}
              {tab.key === "parts" && partsCount > 0 && (
                <span className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] bg-warning text-warning-foreground">
                  {partsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "dashboard" && (
        <div className="space-y-5 sm:space-y-6">
          {/* Row 1: Stat Cards */}
          <DashboardStatCards />

          {/* Row 2: Schedule + Needs Attention */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 sm:gap-6">
            <div className="lg:col-span-3">
              <TodayTimeline />
            </div>
            <div className="lg:col-span-2">
              <NeedsAttentionCard />
            </div>
          </div>

          {/* Row 3: Jobs Update + Revenue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            <JobsUpdateSection />
            <TodaysRevenueCard />
          </div>
        </div>
      )}

      {activeTab === "follow-ups" && <FollowUpsPanel />}

      {activeTab === "parts" && <PartsPanel />}

      {showNewJob && <NewJobPanel onClose={() => setShowNewJob(false)} />}
    </div>
  );
};

export default Dashboard;
