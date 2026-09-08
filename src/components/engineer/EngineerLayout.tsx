import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

import { Clock, CalendarDays, CheckCircle2, LogOut, Briefcase, Package } from "lucide-react";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";
import AppLogo from "@/components/shared/AppLogo";
import HeaderIconButton from "@/components/shared/HeaderIconButton";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationDrawer from "@/components/notifications/NotificationDrawer";
import NotificationBanner from "@/components/notifications/NotificationBanner";
import SoundPrompt from "@/components/notifications/SoundPrompt";
import MessageAlertBanner from "@/components/messages/MessageAlertBanner";
import { unlockAudio } from "@/utils/audio";
import EnableSoundBanner from "@/components/EnableSoundBanner";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import OnboardingTour from "@/components/OnboardingTour";
import { Bug } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import ReportIssueDialog from "@/components/support/ReportIssueDialog";
import ConnectionBanner from "@/components/shared/ConnectionBanner";
import { supabase } from "@/integrations/supabase/client";
import EngineerDesktopNav from "@/components/engineer/EngineerDesktopNav";


const EngineerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth("/auth");
  const { role, canAccessOffice } = useUserRole(user);
  const canSwitchToOffice = canAccessOffice || role === "admin" || role === "office";
  const engineerJobs = useEngineerJobs();
  const { authLoading, todayActive, upcomingJobs, completedJobs, isOnline } = engineerJobs;
  const [notifOpen, setNotifOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (isOnline) setDismissed(false);
  }, [isOnline]);
  const {
    notifications, unreadCount, markAsRead, markAllRead, dismiss,
    soundPromptShown, enableSound, bannerNotifications, dismissBanner,
  } = useNotifications("engineer");
  const { showTour, tourType, completeTour, skipTour, closeTour } = useOnboardingTour(user);

  // Unlock Web Audio on first user gesture (critical for iOS)
  useEffect(() => { unlockAudio(); }, []);

  // /engineer/parts lives inside the Completed section, so it keeps that tab lit.
  const currentTab = location.pathname.includes("/upcoming")
    ? "upcoming"
    : location.pathname.includes("/completed") || location.pathname.includes("/parts")
    ? "completed"
    : "today";

  if (authLoading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#ffffff"
      }}>
        <img
          src="/icons/icon-192.png"
          style={{ width: 64, height: 64, marginBottom: 24 }}
        />
        <div style={{ width: 280 }}>
          <div style={{ height: 20, backgroundColor: "#f0f0f0", borderRadius: 8, marginBottom: 12 }} />
          <div style={{ height: 20, backgroundColor: "#f0f0f0", borderRadius: 8, marginBottom: 12 }} />
          <div style={{ height: 20, backgroundColor: "#f0f0f0", borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  const navItems = [
    { key: "today", label: "Today", icon: Clock, count: todayActive.length, path: "/engineer/today" },
    { key: "upcoming", label: "Upcoming", icon: CalendarDays, count: upcomingJobs.length, path: "/engineer/upcoming" },
    { key: "completed", label: "Completed", icon: CheckCircle2, count: completedJobs.length, path: "/engineer/completed" },
    ...(canAccessOffice ? [{ key: "office", label: "Office", icon: Briefcase, count: 0, path: "/dashboard" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background md:pl-[216px] lg:pl-[232px]">
      <EngineerDesktopNav
        todayCount={todayActive.length}
        upcomingCount={upcomingJobs.length}
        completedCount={completedJobs.length}
        canSwitchToOffice={canSwitchToOffice}
      />
      <div className="max-w-[430px] md:max-w-none mx-auto min-h-screen bg-secondary pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-5 pt-12 pb-5 relative md:bg-none md:bg-card md:border-b md:border-border md:px-6 md:py-2.5 md:sticky md:top-0 md:z-20">
        <div className="flex items-center justify-between gap-2">
          <AppLogo variant="onColor" className="md:hidden" />
          <div className="hidden md:block min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Engineer workspace</div>
            <div className="text-lg font-bold text-foreground">Field service</div>
          </div>
          {/* Labels are hidden on narrow phones (icon-only) so the row can never
              overflow the 430px shell; tap targets stay 44px either way. */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {canSwitchToOffice && (
              <HeaderIconButton
                onClick={() => navigate("/dashboard")}
                tone="onColor"
                className="md:hidden"
                label="Back to Office"
                title="Back to Office"
                aria-label="Back to Office"
              >
                <Briefcase  />
              </HeaderIconButton>
            )}
            <HeaderIconButton
              onClick={() => navigate("/engineer/parts")}
              tone="onColor"
              className="md:text-muted-foreground md:hover:text-foreground md:hover:bg-muted"
              label="Order Parts"
              title="Order Parts"
              aria-label="Order Parts"
            >
              <Package  />
            </HeaderIconButton>
            <HeaderIconButton
              onClick={() => setReportOpen(true)}
              tone="onColor"
              className="md:text-muted-foreground md:hover:text-foreground md:hover:bg-muted"
              label="Report a Bug"
              title="Report a Bug"
              aria-label="Report a Bug"
            >
              <Bug />
            </HeaderIconButton>
            <NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} tone="onColor" label="Alerts" className="md:text-muted-foreground md:hover:text-foreground md:hover:bg-muted" />
            <HeaderIconButton
              onClick={async () => {
                try {
                  await supabase.auth.signOut();
                } catch (err) {
                  console.error("Sign out error:", err);
                }
                navigate("/auth", { replace: true });
              }}
              tone="onColor"
              className="md:text-muted-foreground md:hover:text-foreground md:hover:bg-muted"
              label="Log Out"
              title="Log Out"
              aria-label="Log Out"
            >
              <LogOut  />
            </HeaderIconButton>
          </div>
        </div>

      </div>


      <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} app="engineer" />

      {/* Offline banner */}
      <ConnectionBanner message="No signal — changes won't save until you're back online" />

      {/* Page content — bottom padding clears the fixed nav + iOS home indicator */}
      <div className="px-4 py-6 space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:px-6 lg:px-8 md:pb-8 md:max-w-[1180px] md:mx-auto">
        <ErrorBoundary key={location.pathname} name="engineer-route" homePath="/engineer/today">
          <Outlet context={engineerJobs} />
        </ErrorBoundary>
      </div>

      <EnableSoundBanner />




      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-card border-t border-border/60 flex z-50 pb-[env(safe-area-inset-bottom)] md:hidden" style={{ minHeight: 64 }}>
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
        surface="engineer"
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
        jobPathPrefix="/engineer/job"
      />
      <MessageAlertBanner jobPathPrefix="/engineer/job" />
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
      </div>
    </div>
  );
};

export default EngineerLayout;
