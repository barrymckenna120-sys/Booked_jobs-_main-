import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftRight, CalendarDays, CheckCircle2, Clock, Package } from "lucide-react";
import AppLogo from "@/components/shared/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EngineerDesktopNavProps {
  todayCount?: number;
  upcomingCount?: number;
  completedCount?: number;
  canSwitchToOffice: boolean;
}

export default function EngineerDesktopNav({
  todayCount = 0,
  upcomingCount = 0,
  completedCount = 0,
  canSwitchToOffice,
}: EngineerDesktopNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = [
    {
      label: "Work",
      items: [
        { label: "Today", path: "/engineer/today", icon: Clock, count: todayCount },
        { label: "Upcoming", path: "/engineer/upcoming", icon: CalendarDays, count: upcomingCount },
      ],
    },
    {
      label: "History",
      items: [
        { label: "Job History", path: "/engineer/completed", icon: CheckCircle2, count: completedCount },
        { label: "My Parts", path: "/engineer/parts", icon: Package, count: 0 },
      ],
    },
  ];

  const isActive = (path: string) =>
    pathname === path ||
    (path === "/engineer/today" && pathname.startsWith("/engineer/job/"));

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-[216px] lg:w-[232px] flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-5 pt-5 pb-1"><AppLogo /></div>
      <div className="px-5 pb-5 text-xs font-semibold text-muted-foreground">Engineer workspace</div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5" aria-label="Engineer workspace">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Button
                  key={item.path}
                  variant="ghost"
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "w-full h-10 justify-start gap-3 px-3 rounded-md text-sm font-medium",
                    isActive(item.path)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold hover:bg-sidebar-accent"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-[19px] w-[19px] shrink-0" strokeWidth={2} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{item.count}</span>}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {canSwitchToOffice && (
        <div className="border-t border-border px-3 py-3">
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={() => navigate("/dashboard")}>
            <ArrowLeftRight className="h-5 w-5" /> Back to Office
          </Button>
        </div>
      )}
    </aside>
  );
}