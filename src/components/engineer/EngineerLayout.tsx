import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clock, CalendarDays, CheckCircle2 } from "lucide-react";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";

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
  const { authLoading, todayActive, todayCompleted, upcomingJobs } = useEngineerJobs();

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

        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg">🔥</div>
          <span className="text-white/80 text-sm font-semibold">Karl's Gas</span>
        </div>

        <div className="text-[13px] text-white/70 font-medium mb-1">{formatDateHeading(new Date())}</div>
        <div className="text-[28px] font-extrabold text-white tracking-tight leading-tight mb-1.5">
          {greeting()},<br />Karl 👋
        </div>
        <div className="text-[13px] text-white/75 font-medium">
          {todayActive.length > 0
            ? `${todayActive.length} job${todayActive.length > 1 ? "s" : ""} remaining today`
            : "🎉 All jobs done for today!"}
        </div>
      </div>

      {/* Page content */}
      <div className="px-4 py-5 space-y-5">
        <Outlet />
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-card border-t border-border flex z-50">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => navigate(item.path)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-colors ${
              currentTab === item.key ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <item.icon className="w-5 h-5" />
              {item.count > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {item.count}
                </span>
              )}
            </div>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default EngineerLayout;
