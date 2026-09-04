import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  LayoutDashboard, ClipboardList, Users, Settings, LogOut, Plus, CalendarDays,
  Wrench, TrendingUp, Package, GitBranch, MessageCircle, PoundSterling,
  CalendarCheck, Layers, Shield, BarChart2, Hammer, Loader2,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { LifeBuoy } from "lucide-react";
import ReportIssueDialog from "@/components/support/ReportIssueDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unlockAudio } from "@/utils/audio";
import EnableSoundBanner from "@/components/EnableSoundBanner";
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
   DESKTOP sidebar nav — 11 items
   Settings is a gear icon in the header
   Message Log is deprecated: messaging lives in
   Chat Inbox + the Dashboard feed
   ────────────────────────────────────────────── */
const DESKTOP_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Pipeline", icon: GitBranch, path: "/pipeline" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Warranty", icon: Shield, path: "/warranty" },
  { label: "Calendar", icon: CalendarDays, path: "/schedule" },
  { label: "Finance", icon: PoundSterling, path: "/finance" },
  { label: "Reports", icon: BarChart2, path: "/insights" },
  { label: "Chat Inbox", icon: MessageCircle, path: "/inbox" },
  { label: "Parts", icon: Wrench, path: "/parts" },
  { label: "Products", icon: Package, path: "/products" },
];

/* ──────────────────────────────────────────────
   MOBILE bottom nav — fixed to exactly 5 tabs,
   no horizontal scroll. Deliberate: high-contrast
   icons sized for outdoor readability.
   ────────────────────────────────────────────── */
const MOBILE_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Jobs", icon: CalendarCheck, path: "/jobs" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Pipeline", icon: Layers, path: "/pipeline" },
  { label: "Chat Inbox", icon: MessageCircle, path: "/inbox" },
];

const AppLayoutInner = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { isSuperAdmin } = useAdminViewAs();
  const { role, isEngineer, canAccessOffice, loading: roleLoading } = useUserRole(user);
  // Show "Switch to Engineer View" for office/admin users (owners/managers)
  const canSwitchToEngineer = !isEngineer;
  const location = useLocation();
  const navigate = useNavigate();
  const { guardedNavigate, pendingDestination, confirmNavigation, cancelNavigation } = useNavigationGuard();
  const [showNewJob, setShowNewJob] = useState(false);
  const closeNewJob = useCallback(() => setShowNewJob(false), []);
  useBackButton(showNewJob, closeNewJob);
  const [reportOpen, setReportOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const {
    notifications, unreadCount, markAsRead, markAllRead, dismiss,
    soundPromptShown, enableSound, bannerNotifications, dismissBanner,
  } = useNotifications("office");
  const unreadMessages = useUnreadMessages();
  const userId = user?.id;
  const { data: partsCount = 0 } = useQuery({
    queryKey: ["parts-nav-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("parts_requests" as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["Open", "Ordered", "Ready to Fit"]);
      return count || 0;
    },
    // Without a session this request 401s (PostgREST rejects it) and only logs
    // noise — the badge is meaningless when signed out.
    enabled: !!userId,
    refetchInterval: 30000,
  });

  const { showTour, tourType, completeTour, skipTour, closeTour } = useOnboardingTour(user);

  useEffect(() => {
    unlockAudio();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        unlockAudio();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /* Watchdog: Radix sets `pointer-events: none` on <body> while a modal/select
     is open and removes it on close. If such a component unmounts while still
     open (e.g. a remount during a re-render, or a route change), the style is
     left behind and the whole page stops responding to clicks/taps. Clear it
     whenever no Radix overlay is actually mounted. */
  useEffect(() => {
    const check = () => {
      if (document.body.style.pointerEvents !== "none") return;
      // Be deliberately generous here: anything that could legitimately be
      // holding the lock (dialog, alert dialog, sheet/drawer, select, dropdown,
      // popover, tooltip popper, focus guards) must keep it. Only a genuinely
      // orphaned style is cleared.
      const overlayOpen = document.querySelector(
        '[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-focus-guard],[data-radix-select-viewport],[data-vaul-drawer],[data-state="open"][data-radix-popper-content-wrapper]',
      );
      if (!overlayOpen) document.body.style.removeProperty("pointer-events");
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"], childList: true });
    const interval = window.setInterval(check, 1000);
    return () => { observer.disconnect(); window.clearInterval(interval); };
  }, []);



  // Block the whole office shell (and the child <Outlet />) until the
  // permission check resolves, so restricted pages never paint before the
  // engineer redirect fires. Single shared gate for every office route.
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEngineer && !canAccessOffice) {
    return <Navigate to="/engineer/today" replace />;
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <WhatsAppConnectionBanner />

      {/* ═══════════ DESKTOP SIDEBAR ═══════════ */}
      <aside className="hidden md:flex flex-col w-[200px] lg:w-[220px] border-r border-border bg-card min-h-screen fixed left-0 top-0 z-30">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <img src="https://res.cloudinary.com/ddx2gnklt/image/upload/v1782321168/IMG_3806_usj2yt.png" alt="BookedJobs" className="h-8" />
          <div className="flex items-center gap-1">
            {canSwitchToEngineer && (
              <button
                onClick={() => navigate("/engineer/today")}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Switch to Engineer View"
              >
                <Hammer className="w-4 h-4" /> Engineer View
              </button>
            )}
            <button
              onClick={() => setReportOpen(true)}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Report an issue"
              aria-label="Report an issue"
            >
              <LifeBuoy className="w-5 h-5" />
            </button>
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
          {isSuperAdmin && (
            <button
              onClick={() => guardedNavigate("/admin")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive("/admin")
                  ? "bg-primary/10 text-primary font-bold border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Shield className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-left">Admin</span>
            </button>
          )}
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
      <header className="md:hidden flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-border bg-card sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <img src="https://res.cloudinary.com/ddx2gnklt/image/upload/v1782321168/IMG_3806_usj2yt.png" alt="BookedJobs" className="h-8" />
        </div>
        <div className="flex items-center gap-1.5">
          {canSwitchToEngineer && (
            <button
              onClick={() => navigate("/engineer/today")}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Switch to Engineer View"
              aria-label="Engineer View"
            >
              <Hammer className="w-5 h-5" />
            </button>
          )}
          <Button size="sm" className="gap-1 font-bold" onClick={() => setShowNewJob(true)}>
            <Plus className="w-3.5 h-3.5" /> New Job
          </Button>
          <button
            onClick={() => setReportOpen(true)}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Report an issue"
            aria-label="Report an issue"
          >
            <LifeBuoy className="w-5 h-5" />
          </button>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } catch (err) {
                console.error("Sign out error:", err);
              }
              navigate("/auth", { replace: true });
            }}
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="flex-1 min-w-0 md:ml-[200px] lg:ml-[220px] pb-20 md:pb-0">
        <ErrorBoundary key={location.pathname} name="office-route" homePath="/dashboard">
          <Outlet />
        </ErrorBoundary>
      </main>

      <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} app="office" />

      <EnableSoundBanner />

      {/* ═══════════ MOBILE BOTTOM NAV — 5 tabs, fixed ═══════════ */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-stretch justify-around px-4" style={{ height: 56 }}>
          {MOBILE_NAV.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => guardedNavigate(item.path)}
                className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] transition-colors ${
                  active ? "text-primary font-bold" : ""
                }`}
                style={active ? undefined : { color: "#6B7280" }}
              >
                <div className="relative">
                  <item.icon className="w-6 h-6" strokeWidth={2.5} />
                  {item.path === "/inbox" && unreadMessages > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[9px] font-extrabold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                      {unreadMessages > 99 ? "99+" : unreadMessages}
                    </span>
                  )}
                </div>
                <span className="text-[10px] leading-tight mt-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showNewJob && <NewJobPanel onClose={() => setShowNewJob(false)} />}
      <NotificationDrawer
        surface="office"
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
      <MessageAlertBanner jobPathPrefix="/jobs" />
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
