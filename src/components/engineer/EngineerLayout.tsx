import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clock, CalendarDays, CheckCircle2, Hand, PartyPopper, LogOut, Briefcase, Package } from "lucide-react";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationDrawer from "@/components/notifications/NotificationDrawer";
import NotificationBanner from "@/components/notifications/NotificationBanner";
import SoundPrompt from "@/components/notifications/SoundPrompt";
import MessageAlertBanner from "@/components/messages/MessageAlertBanner";
import { unlockAudio } from "@/utils/audio";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import OnboardingTour from "@/components/OnboardingTour";
import { WifiOff, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";


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
  const { user, signOut } = useAuth("/auth");
  const { role, canAccessOffice } = useUserRole(user);
  const canSwitchToOffice = canAccessOffice || role === "admin" || role === "office";
  const engineerJobs = useEngineerJobs();
  const { authLoading, todayActive, upcomingJobs, completedJobs, engineerName, isEngineerNotLinked, isOnline } = engineerJobs;
  const [notifOpen, setNotifOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    if (isOnline) setDismissed(false);
  }, [isOnline]);
  const {
    notifications, unreadCount, markAsRead, markAllRead, dismiss,
    soundPromptShown, enableSound, bannerNotifications, dismissBanner,
  } = useNotifications();
  const { showTour, tourType, completeTour, skipTour, closeTour } = useOnboardingTour(user);

  // Unlock Web Audio on first user gesture (critical for iOS)
  useEffect(() => { unlockAudio(); }, []);

  // Active connectivity check against Supabase (avoids navigator.onLine lying on weak 5G)
  useEffect(() => {
    let cancelled = false;

    const checkConnectivity = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        // Any HTTP response proves network reachability — even 401 means we're online.
        await fetch("https://ktkfuquqxbrmuqrmbmdj.supabase.co/rest/v1/", {
          method: "HEAD",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!cancelled) setBrowserOnline(true);
      } catch {
        if (!cancelled) setBrowserOnline(false);
      } finally {
        clearTimeout(timeout);
      }
    };


    checkConnectivity();
    const interval = setInterval(checkConnectivity, 30000);
    window.addEventListener("online", checkConnectivity);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", checkConnectivity);
    };
  }, []);

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
            {canSwitchToOffice && (
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1.5 text-white/70 hover:text-white active:text-white transition-colors text-xs font-semibold min-h-[44px] px-2"
                title="Back to Office"
              >
                <Briefcase className="w-4 h-4" /> Back to Office
              </button>
            )}
            <NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} className="text-white/70 hover:text-white" />
            <button
              onClick={async () => {
                try {
                  await supabase.auth.signOut();
                } catch (err) {
                  console.error("Sign out error:", err);
                }
                navigate("/auth", { replace: true });
              }}
              className="flex items-center gap-1.5 text-white/60 hover:text-white/90 active:text-white transition-colors text-xs font-semibold min-h-[44px] min-w-[44px] px-2"
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
          {isEngineerNotLinked
            ? <>⚠️ Account not linked — please contact your office</>
            : todayActive.length > 0
            ? `${todayActive.length} job${todayActive.length > 1 ? "s" : ""} remaining today`
            : <><PartyPopper className="w-4 h-4" /> All jobs done for today!</>}
        </div>
      </div>


      {/* Offline banner */}
      {!browserOnline && (
        <div className="w-full bg-[hsl(var(--warning))] text-white pl-4 py-2 flex items-center justify-center gap-2 text-xs font-bold shadow-sm relative">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>No signal — changes won't save until you're back online</span>
        </div>
      )}

      {/* Page content — bottom padding clears the fixed nav + iOS home indicator */}
      <div className="px-4 py-6 space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))]">
        <Outlet context={engineerJobs} />
      </div>




      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-card border-t border-border/60 flex z-50 pb-[env(safe-area-inset-bottom)]" style={{ minHeight: 64 }}>
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
      <NotificationBanner
        notifications={bannerNotifications}
        onDismiss={dismissBanner}
        onMarkRead={markAsRead}
        jobPathPrefix="/engineer/job"
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
    </div>
  );
};

export default EngineerLayout;
