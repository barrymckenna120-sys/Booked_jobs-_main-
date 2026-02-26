import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Users, CreditCard, CalendarDays, Plus, Loader2 } from "lucide-react";
import NewJobPanel from "@/components/jobs/NewJobPanel";
import { format } from "date-fns";

import WeekSnapshot from "@/components/dashboard/WeekSnapshot";
import LiveActivityFeed from "@/components/dashboard/LiveActivityFeed";
import TodayTimeline from "@/components/dashboard/TodayTimeline";

import RevenueSnapshot from "@/components/dashboard/RevenueSnapshot";
import AlertsPanel from "@/components/dashboard/AlertsPanel";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [showNewJob, setShowNewJob] = useState(false);

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

  // KPI data
  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ["dashboard-kpi", user?.id, todayStr],
    queryFn: async () => {
      const [todayRes, customersRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("status, revenue")
          .eq("scheduled_date", todayStr),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true }),
      ]);

      const todayJobs = todayRes.data || [];
      const todayRevenue = todayJobs
        .filter((j: any) => j.status === "Completed")
        .reduce((s: number, j: any) => s + (j.revenue || 0), 0);
      const todayCompleted = todayJobs.filter((j: any) => j.status === "Completed").length;
      const todayRemaining = todayJobs.filter((j: any) => !["Completed", "Cancelled"].includes(j.status)).length;

      return {
        todayTotal: todayJobs.length,
        todayCompleted,
        todayRemaining,
        todayRevenue,
        totalCustomers: customersRes.count || 0,
      };
    },
    enabled: !!user,
  });

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

  const displayName = profile?.display_name?.split("@")[0]?.split(" ")[0] || "there";

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const kpiCards = [
    {
      label: "Today's Jobs",
      value: kpi?.todayTotal || 0,
      sub: `${kpi?.todayCompleted || 0} done · ${kpi?.todayRemaining || 0} left`,
      Icon: CalendarDays,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Today's Revenue",
      value: `€${(kpi?.todayRevenue || 0).toLocaleString()}`,
      sub: "from completed jobs",
      Icon: CreditCard,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      label: "Total Customers",
      value: kpi?.totalCustomers || 0,
      sub: "in your database",
      Icon: Users,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      onClick: () => navigate("/customers"),
    },
    {
      label: "Active Jobs",
      value: kpi?.todayRemaining || 0,
      sub: "still in progress",
      Icon: ClipboardList,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      onClick: () => navigate("/jobs"),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
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

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card
            key={card.label}
            className={`shadow-sm border-border/60 ${card.onClick ? "cursor-pointer hover:border-primary/30" : ""} transition-colors`}
            onClick={card.onClick}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <card.Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-foreground leading-none">{kpiLoading ? "—" : card.value}</div>
              <div className="text-[11px] text-muted-foreground/60 font-semibold mt-1.5">{card.label}</div>
              <div className="text-[10px] text-muted-foreground/50 mt-0.5">{kpiLoading ? "" : card.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts (hidden if none) */}
      <AlertsPanel />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Today + Week */}
        <div className="lg:col-span-2 space-y-6">
          <TodayTimeline />
          <WeekSnapshot />
        </div>

        {/* Right: Revenue + Activity */}
        <div className="space-y-6">
          <RevenueSnapshot />
          <LiveActivityFeed />
        </div>
      </div>
      {showNewJob && <NewJobPanel onClose={() => setShowNewJob(false)} />}
    </div>
  );
};

export default Dashboard;