import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus, Loader2, AlertTriangle, Package, BookOpen, ChevronRight, Wrench } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import NewJobPanel from "@/components/jobs/NewJobPanel";
import { useBackButton } from "@/hooks/useBackButton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import DashboardStatCards from "@/components/dashboard/DashboardStatCards";
import TodayTimeline from "@/components/dashboard/TodayTimeline";
import NeedsAttentionCard from "@/components/dashboard/NeedsAttentionCard";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import FollowUpsPanel from "@/components/dashboard/FollowUpsPanel";
import PartsPanel from "@/components/dashboard/PartsPanel";
import { useDeferredMount } from "@/hooks/useDeferredMount";

// Step 4 — Calm the Network: revenue/jobs-update panels are secondary data, so
// they're code-split and mounted after the core schedule has painted.
const JobsUpdateSection = lazy(() => import("@/components/dashboard/JobsUpdateSection"));
const TodaysRevenueCard = lazy(() => import("@/components/dashboard/TodaysRevenueCard"));

const SecondaryPanelSkeleton = () => (
  <div className="h-40 rounded-lg border border-border bg-card animate-pulse" />
);

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
  const { isEngineer, canAccessOffice } = useUserRole(user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewJob, setShowNewJob] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const closeNewJob = useCallback(() => setShowNewJob(false), []);
  useBackButton(showNewJob, closeNewJob);

  const [showAuthLoader, setShowAuthLoader] = useState(false);
  useEffect(() => {
    if (!authLoading) {
      setShowAuthLoader(false);
      return;
    }
    const timer = setTimeout(() => setShowAuthLoader(true), 300);
    return () => clearTimeout(timer);
  }, [authLoading]);

  const mountedRef = useRef(false);

  // Toast alert when a new incoming job notification arrives
  useEffect(() => {
    if (!user) return;
    // Skip toasts during initial load
    const timer = setTimeout(() => { mountedRef.current = true; }, 2000);

    const channel = supabase
      .channel("dashboard-new-job-toast")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const n = payload.new as any;
          if (n.notification_type === "new_job" && n.metadata?.source === "Tally Form") {
            const customerName = n.metadata?.customer_name || "Customer";
            toast({
              title: "📥 New job received",
              description: `${customerName} — Tap to view`,
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  // Realtime: refresh dashboard when any service_call changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dashboard-jobs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_calls" }, () => {
        // Invalidate all dashboard-related queries
        queryClient.invalidateQueries({ predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key?.startsWith("dashboard-") || ["jobs-update", "follow-up-count", "parts-count", "revenue-card", "follow-ups", "parts-panel"].includes(key);
        }});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

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
        .from("parts_requests" as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["Open", "Ordered", "Ready to Fit"]);
      return count || 0;
    },
    enabled: !!user,
  });

  const displayName = titleCase(profile?.display_name?.split("@")[0]?.split(" ")[0] || "there");

  if (showAuthLoader) {
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

          {/* Row 3: Jobs Update + Revenue — secondary, deferred until idle */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            {secondaryReady ? (
              <Suspense fallback={<SecondaryPanelSkeleton />}>
                <JobsUpdateSection />
              </Suspense>
            ) : (
              <SecondaryPanelSkeleton />
            )}
            {secondaryReady ? (
              <Suspense fallback={<SecondaryPanelSkeleton />}>
                <TodaysRevenueCard />
              </Suspense>
            ) : (
              <SecondaryPanelSkeleton />
            )}
          </div>


          {/* Sales Ledger link card */}
          <button
            onClick={() => navigate("/finance")}
            className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-lg shadow-sm hover:bg-accent/50 transition-colors text-left"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground">Sales Report</div>
              <div className="text-xs text-muted-foreground mt-0.5">View full payment & invoice history</div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        </div>
      )}

      {activeTab === "follow-ups" && <FollowUpsPanel />}

      {activeTab === "parts" && <PartsPanel />}

      {showNewJob && <NewJobPanel onClose={() => setShowNewJob(false)} />}

      {canAccessOffice && (
        <div className="md:hidden fixed left-0 right-0 z-40 px-4" style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => navigate("/engineer/today")}
            className="w-full flex items-center justify-center gap-2 bg-[#2563EB] text-white rounded-xl py-3 text-base font-semibold hover:bg-[#1d4ed8] transition-colors shadow-lg"
          >
            <Wrench className="h-5 w-5" />
            Switch to Engineer View
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
