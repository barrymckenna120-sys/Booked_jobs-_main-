import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clock, CalendarDays, CheckCircle2, Hand, PartyPopper, LogOut, Bell } from "lucide-react";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";
import { supabase } from "@/integrations/supabase/client";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationDrawer from "@/components/notifications/NotificationDrawer";
import SoundPrompt from "@/components/notifications/SoundPrompt";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const formatDateHeading = (d: Date) => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const EngineerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authLoading, todayActive, todayCompleted, upcomingJobs, engineerName } = useEngineerJobs();
  const [notifOpen, setNotifOpen] = useState(false);
  const {
    notifications, unreadCount, markAsRead, markAllRead, dismiss,
    soundPromptShown, enableSound,
  } = useNotifications();

  const currentTab = location.pathname.includes("/upcoming")
    ? "upcoming"
    : location.pathname.includes("/completed")
    ? "completed"
    : "today";

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  const navItems = [
    { key: "today", label: "Today", icon: Clock, count: todayActive.length, path: "/engineer/today" },
    { key: "upcoming", label: "Upcoming", icon: CalendarDays, count: upcomingJobs.length, path: "/engineer/upcoming" },
    { key: "completed", label: "Completed", icon: CheckCircle2, count: todayCompleted.length, path: "/engineer/completed" },
  ];

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-secondary pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-5 pt-12 pb-7 relative overflow-hidden">
        <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-white/[0.07] pointer-events-none" />
        <div className="absolute -bottom-14 right-12 w-36 h-36 rounded-full bg-white/[0.05] pointer-events-none" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <img src={bookedJobsLogo} alt="BookedJobs" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-white/80 text-sm font-semibold">BookedJobs</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setNotifOpen(true)} className="relative text-white/70 hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}
              className="flex items-center gap-1.5 text-white/60 hover:text-white/90 transition-colors text-xs font-semibold"
            >
              <LogOut className="w-4 h-4" /> Log Out
            </button>
          </div>
        </div>

        <div className="text-[13px] text-white/70 font-medium mb-1">{formatDateHeading(new Date())}</div>
        <div className="text-[28px] font-extrabold text-white tracking-tight leading-tight mb-1.5 flex items-end gap-2">
          {greeting()},<br />{engineerName?.split(" ")[0] || "Engineer"} <Hand className="w-7 h-7 text-white/80 mb-0.5" />
        </div>
        <div className="text-[13px] text-white/75 font-medium flex items-center gap-1.5">
          {todayActive.length > 0
            ? `${todayActive.length} job${todayActive.length > 1 ? "s" : ""} remaining today`
            : <><PartyPopper className="w-4 h-4" /> All jobs done for today!</>}
        </div>
      </div>

      {/* Page content */}
      <div className="px-4 py-6 space-y-6">
        <Outlet />
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-card border-t border-border/60 flex z-50" style={{ minHeight: 64 }}>
        {navItems.map((item) => {
          const active = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] py-2 text-xs font-semibold transition-colors ${
                active ? "text-primary" : "text-muted-foreground/70"
              }`}
            >
              <div className="relative">
                <item.icon className="w-7 h-7" />
                {item.count > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {item.count}
                  </span>
                )}
              </div>
              {active && <span className="text-[11px] leading-tight">{item.label}</span>}
            </button>
          );
        })}
      </div>
      <NotificationDrawer
        open={notifOpen}
        onOpenChange={setNotifOpen}
        notifications={notifications}
        onMarkRead={markAsRead}
        onMarkAllRead={markAllRead}
        onDismiss={dismiss}
      />
      <SoundPrompt
        open={soundPromptShown}
        onEnable={() => enableSound(true)}
        onDismiss={() => enableSound(false)}
      />
    </div>
  );
};

export default EngineerLayout;
