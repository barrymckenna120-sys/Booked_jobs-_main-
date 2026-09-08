import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

import { Clock, CalendarDays, CheckCircle2, Briefcase, Package } from "lucide-react";
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

import EngineerDesktopNav from "@/components/engineer/EngineerDesktopNav";


const EngineerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth("/auth");
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
        onSignOut={signOut}
      />
      <div className="max-w-[430px] md:max-w-none mx-auto min-h-screen bg-secondary pb-20 md:pb-0">
      {/* Mobile header — same shared shell as the office workspace */}
      <MobileWorkspaceHeader
        identity={<WorkspaceIdentity label="Engineer" icon={Wrench} />}
        switchControl={
          canSwitchToOffice ? (
            <WorkspaceSwitchButton label="Office" icon={ArrowLeft} onClick={() => navigate("/dashboard")} />
          ) : undefined
        }
        bell={<NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} />}
        overflow={
          <HeaderOverflowMenu
            items={[
              { label: "Order Parts", icon: Package, onSelect: () => navigate("/engineer/parts") },
              { label: "Report a Bug", icon: Bug, onSelect: () => setReportOpen(true) },
              { label: "Sign Out", icon: LogOut, separatorBefore: true, onSelect: () => signOut() },
            ]}
          />
        }
      />

      {/* Desktop header */}
      <div className="hidden md:block bg-card border-b border-border px-6 py-2.5 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Engineer workspace</div>
            <div className="text-lg font-bold text-foreground">Field service</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <HeaderIconButton
              onClick={() => navigate("/engineer/parts")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
              label="Order Parts"
              title="Order Parts"
              aria-label="Order Parts"
            >
              <Package />
            </HeaderIconButton>
            <HeaderIconButton
              onClick={() => setReportOpen(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
              label="Report a Bug"
              title="Report a Bug"
              aria-label="Report a Bug"
            >
              <Bug />
            </HeaderIconButton>
            <NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} label="Alerts" className="text-muted-foreground hover:text-foreground hover:bg-muted" />
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
