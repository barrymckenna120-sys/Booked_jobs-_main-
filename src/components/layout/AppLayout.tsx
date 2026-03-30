import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import OfflineBanner from "@/components/engineer/OfflineBanner";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  LayoutDashboard, ClipboardList, Users, Settings, LogOut, Plus, CalendarDays,
  Wrench, TrendingUp, Package, GitBranch, MessageCircle,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unlockAudio } from "@/utils/audio";
import { Button } from "@/components/ui/button";
import NewJobPanel from "@/components/jobs/NewJobPanel";
import { useBackButton } from "@/hooks/useBackButton";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationDrawer from "@/components/notifications/NotificationDrawer";
import NotificationBanner from "@/components/notifications/NotificationBanner";
import SoundPrompt from "@/components/notifications/SoundPrompt";
import UnsavedChangesModal from "@/components/customer/UnsavedChangesModal";
import { NavigationGuardProvider, useNavigationGuard } from "@/hooks/useNavigationGuard";
import MessageAlertBanner from "@/components/messages/MessageAlertBanner";
import WhatsAppConnectionBanner from "@/components/whatsapp/WhatsAppConnectionBanner";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import OnboardingTour from "@/components/OnboardingTour";

/* ──────────────────────────────────────────────
   DESKTOP sidebar nav — 9 items
   Settings is a gear icon in the header
   ────────────────────────────────────────────── */
const DESKTOP_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Pipeline", icon: GitBranch, path: "/pipeline" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Calendar", icon: CalendarDays, path: "/schedule" },
  { label: "Finance", icon: TrendingUp, path: "/finance" },
  { label: "Inbox", icon: Inbox, path: "/inbox" },
  { label: "Parts", icon: Wrench, path: "/parts" },
  { label: "Products", icon: Package, path: "/products" },
];

/* ──────────────────────────────────────────────
   MOBILE bottom nav — horizontally scrollable
   All tabs are primary, no hidden menus
   ────────────────────────────────────────────── */
const MOBILE_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Pipeline", icon: GitBranch, path: "/pipeline" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Calendar", icon: CalendarDays, path: "/schedule" },
  { label: "Finance", icon: TrendingUp, path: "/finance" },
  { label: "Inbox", icon: Inbox, path: "/inbox" },
  { label: "Parts", icon: Wrench, path: "/parts" },
  { label: "Products", icon: Package, path: "/products" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

const AppLayoutInner = () => {
  const { user, signOut } = useAuth();
  const { isEngineer, loading: roleLoading } = useUserRole(user);
  const location = useLocation();
  const navigate = useNavigate();
  const { guardedNavigate, pendingDestination, confirmNavigation, cancelNavigation } = useNavigationGuard();
  const [showNewJob, setShowNewJob] = useState(false);
  const closeNewJob = useCallback(() => setShowNewJob(false), []);
  useBackButton(showNewJob, closeNewJob);
  const [notifOpen, setNotifOpen] = useState(false);
  const {
    notifications, unreadCount, markAsRead, markAllRead, dismiss,
    soundPromptShown, enableSound, bannerNotifications, dismissBanner,
  } = useNotifications();
  const unreadMessages = useUnreadMessages();
  const { data: partsCount = 0 } = useQuery({
    queryKey: ["parts-nav-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("service_calls")
        .select("id", { count: "exact", head: true })
        .in("status", ["parts_needed", "parts_ordered"]);
      return count || 0;
    },
    refetchInterval: 30000,
  });
  const { showTour, tourType, completeTour, skipTour, closeTour } = useOnboardingTour(user);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => { unlockAudio(); }, []);

  // Auto-scroll mobile nav to show active tab
  useEffect(() => {
    if (!mobileNavRef.current) return;
    const activeBtn = mobileNavRef.current.querySelector('[data-active="true"]');
    if (activeBtn) {
      (activeBtn as HTMLElement).scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [location.pathname]);

  if (!roleLoading && isEngineer) {
    return <Navigate to="/engineer/today" replace />;
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <WhatsAppConnectionBanner />

      {/* ═══════════ DESKTOP SIDEBAR ═══════════ */}
      <aside className="hidden md:flex flex-col w-[220px] border-r border-border bg-card min-h-screen fixed left-0 top-0 z-30">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <img src={bookedJobsLogo} alt="BookedJobs" className="h-8" />
          <div className="flex items-center gap-1">
            <NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} className="text-muted-foreground hover:text-foreground hover:bg-muted" />
            <button
              onClick={() => guardedNavigate("/settings")}
              className={`p-2 rounded-md transition-colors ${
                isActive("/settings")
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-3 pt-3">
          <Button className="w-full gap-1.5 font-extrabold" onClick={() => setShowNewJob(true)}>
            <Plus className="w-4 h-4" /> New Job
          </Button>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {DESKTOP_NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => guardedNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? "bg-primary/10 text-primary font-bold border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.path === "/inbox" && unreadMessages > 0 && (
                <span className="bg-[#4A86E8] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {unreadMessages}
                </span>
              )}
              {item.path === "/parts" && partsCount > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {partsCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-border">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ═══════════ MOBILE TOP BAR ═══════════ */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <img src={bookedJobsLogo} alt="BookedJobs" className="h-8" />
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="gap-1 font-bold" onClick={() => setShowNewJob(true)}>
            <Plus className="w-3.5 h-3.5" /> New Job
          </Button>
          <NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} className="text-muted-foreground hover:text-foreground hover:bg-muted" />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="flex-1 md:ml-[220px] pb-20 md:pb-0">
        <OfflineBanner topOffsetClassName="top-14 md:top-0" />
        <Outlet />
      </main>

      {/* ═══════════ MOBILE BOTTOM NAV — horizontally scrollable ═══════════ */}
      <nav
        ref={mobileNavRef}
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-stretch overflow-x-auto scrollbar-hide px-1"
        style={{ minHeight: 64, WebkitOverflowScrolling: "touch" }}
      >
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              data-active={active}
              onClick={() => guardedNavigate(item.path)}
              className={`flex flex-col items-center justify-center shrink-0 min-w-[56px] min-h-[48px] px-2 py-1.5 ${
                active ? "text-primary font-bold" : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                <item.icon className="w-6 h-6" />
                {item.path === "/inbox" && unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-[#4A86E8] text-white text-[9px] font-bold rounded-full px-1 min-w-[16px] text-center leading-[16px]">
                    {unreadMessages}
                  </span>
                )}
                {item.path === "/parts" && partsCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full px-1 min-w-[16px] text-center leading-[16px]">
                    {partsCount}
                  </span>
                )}
              </div>
              {active && <span className="text-[10px] leading-tight mt-0.5">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {showNewJob && <NewJobPanel onClose={() => setShowNewJob(false)} />}
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
      <NotificationBanner
        notifications={bannerNotifications}
        onDismiss={dismissBanner}
        onMarkRead={markAsRead}
        jobPathPrefix="/jobs"
      />
      <MessageAlertBanner />
      {user && (
        <OnboardingTour
          open={showTour}
          tourType={tourType}
          userId={user.id}
          onComplete={completeTour}
          onSkip={skipTour}
          onClose={closeTour}
        />
      )}
      <UnsavedChangesModal
        open={pendingDestination !== null}
        onGoBack={cancelNavigation}
        onDiscard={confirmNavigation}
      />
    </div>
  );
};

const AppLayout = () => (
  <NavigationGuardProvider>
    <AppLayoutInner />
  </NavigationGuardProvider>
);

export default AppLayout;
