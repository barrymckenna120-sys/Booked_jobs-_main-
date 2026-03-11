import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { LayoutDashboard, ClipboardList, Receipt, Users, RefreshCw, MessageCircle, FileText, Inbox, Settings, LogOut, ChevronDown, Wrench, TrendingUp, CalendarDays, UsersRound, ScrollText, Plus, Euro } from "lucide-react";
import { useState, useCallback } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const MAIN_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Renewals", icon: RefreshCw, path: "/renewals" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Schedule", icon: CalendarDays, path: "/schedule" },
  { label: "Incoming", icon: Inbox, path: "/incoming" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Quotes", icon: Receipt, path: "/quotes" },
  { label: "Finance", icon: TrendingUp, path: "/finance" },
];

const WHATSAPP_CHILDREN = [
  { label: "Messages", path: "/whatsapp" },
  { label: "Templates", path: "/whatsapp/templates" },
];

const BOTTOM_NAV = [
  { label: "Settings", icon: Settings, path: "/settings" },
];

// Mobile: flatten but group WhatsApp as single item
const MOBILE_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Renewals", icon: RefreshCw, path: "/renewals" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Schedule", icon: CalendarDays, path: "/schedule" },
  { label: "Incoming", icon: Inbox, path: "/incoming" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Quotes", icon: Euro, path: "/quotes" },
  { label: "Finance", icon: TrendingUp, path: "/finance" },
  { label: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

const AppLayoutInner = () => {
  const { user, signOut } = useAuth();
  const { isEngineer, loading: roleLoading } = useUserRole(user);
  const location = useLocation();
  const navigate = useNavigate();
  const { guardedNavigate, pendingDestination, confirmNavigation, cancelNavigation } = useNavigationGuard();
  const [whatsappOpen, setWhatsappOpen] = useState(
    location.pathname.startsWith("/whatsapp")
  );
  const [showNewJob, setShowNewJob] = useState(false);
  const closeNewJob = useCallback(() => setShowNewJob(false), []);
  useBackButton(showNewJob, closeNewJob);
  const [notifOpen, setNotifOpen] = useState(false);
  const {
    notifications, unreadCount, markAsRead, markAllRead, dismiss,
    soundPromptShown, enableSound, bannerNotifications, dismissBanner,
  } = useNotifications();
  // Engineers should not access admin pages — redirect to engineer app
  if (!roleLoading && isEngineer) {
    return <Navigate to="/engineer/today" replace />;
  }

  const isActive = (path: string) => location.pathname === path || (path !== "/whatsapp" && location.pathname.startsWith(path));
  const isWhatsAppActive = location.pathname.startsWith("/whatsapp");

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[220px] border-r border-border bg-card min-h-screen fixed left-0 top-0 z-30">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <img src={bookedJobsLogo} alt="BookedJobs" className="h-8" />
          <NotificationBell unreadCount={unreadCount} onClick={() => setNotifOpen(true)} className="text-muted-foreground hover:text-foreground hover:bg-muted" />
        </div>
        <div className="px-3 pt-3">
          <Button className="w-full gap-1.5 font-extrabold" onClick={() => setShowNewJob(true)}>
            <Plus className="w-4 h-4" /> New Job
          </Button>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {MAIN_NAV.map((item) => (
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
              <span>{item.label}</span>
            </button>
          ))}

          {/* WhatsApp collapsible group */}
          <Collapsible open={whatsappOpen} onOpenChange={setWhatsappOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isWhatsAppActive
                    ? "bg-primary/10 text-primary font-bold border-l-[3px] border-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <MessageCircle className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">WhatsApp</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${whatsappOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 space-y-0.5 pt-0.5">
              {WHATSAPP_CHILDREN.map((child) => (
                <button
                  key={child.path}
                  onClick={() => guardedNavigate(child.path)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    location.pathname === child.path
                      ? "text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {child.label}
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {BOTTOM_NAV.map((item) => (
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
              <span>{item.label}</span>
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

      {/* Mobile Top Bar */}
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

      {/* Main Content */}
      <main className="flex-1 md:ml-[220px] pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar — WhatsApp & Templates merged into single tab */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-stretch overflow-x-auto px-1 scrollbar-hide" style={{ minHeight: 64 }}>
        {MOBILE_NAV.map((item) => {
          const active = item.path === "/whatsapp" ? isWhatsAppActive : isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => guardedNavigate(item.path)}
              className={`flex flex-col items-center justify-center shrink-0 min-w-[48px] min-h-[48px] px-2 py-1.5 ${
                active ? "text-primary font-bold" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-7 h-7" />
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
