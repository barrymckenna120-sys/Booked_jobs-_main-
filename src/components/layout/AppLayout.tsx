import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, ClipboardList, Receipt, Users, RefreshCw, MessageCircle, FileText, Inbox, Settings, LogOut, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const MAIN_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Quotes", icon: Receipt, path: "/quotes" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Renewals", icon: RefreshCw, path: "/renewals" },
];

const WHATSAPP_CHILDREN = [
  { label: "Messages", path: "/whatsapp" },
  { label: "Templates", path: "/whatsapp/templates" },
];

const BOTTOM_NAV = [
  { label: "Incoming", icon: Inbox, path: "/incoming" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

// Mobile: flatten but group WhatsApp as single item
const MOBILE_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Jobs", icon: ClipboardList, path: "/jobs" },
  { label: "Quotes", icon: Receipt, path: "/quotes" },
  { label: "Customers", icon: Users, path: "/customers" },
  { label: "Renewals", icon: RefreshCw, path: "/renewals" },
  { label: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { label: "Incoming", icon: Inbox, path: "/incoming" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

const AppLayout = () => {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [whatsappOpen, setWhatsappOpen] = useState(
    location.pathname.startsWith("/whatsapp")
  );

  const isActive = (path: string) => location.pathname === path || (path !== "/whatsapp" && location.pathname.startsWith(path));
  const isWhatsAppActive = location.pathname.startsWith("/whatsapp");

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[220px] border-r border-border bg-card min-h-screen fixed left-0 top-0 z-30">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <div className="w-[34px] h-[34px] rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-lg">
            🔥
          </div>
          <span className="font-extrabold text-foreground text-lg tracking-tight">Karl's Gas</span>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {MAIN_NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
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
                  onClick={() => navigate(child.path)}
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
              onClick={() => navigate(item.path)}
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
          <div className="w-[34px] h-[34px] rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-lg">
            🔥
          </div>
          <span className="font-extrabold text-foreground text-lg tracking-tight">Karl's Gas</span>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut}>
          <LogOut className="w-5 h-5" />
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 md:ml-[220px] pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar — WhatsApp & Templates merged into single tab */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border h-16 flex items-center overflow-x-auto px-1 scrollbar-hide">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] shrink-0 py-1 ${
              item.path === "/whatsapp"
                ? isWhatsAppActive ? "text-primary font-bold" : "text-muted-foreground"
                : isActive(item.path) ? "text-primary font-bold" : "text-muted-foreground"
            }`}
          >
            <item.icon className="w-6 h-6" />
            <span className="text-[10px] leading-tight">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default AppLayout;
