import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  Building2,
  Cable,
  FileClock,
  LifeBuoy,
  Menu,
  MessageSquareText,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import AppLogo from "@/components/shared/AppLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AdminSection =
  | "tenants"
  | "integrations"
  | "messaging"
  | "unblock-users"
  | "user-activity"
  | "import-runs"
  | "delivery-issues"
  | "support-reports";

const groups = [
  {
    label: "Admin",
    items: [
      { value: "tenants" as const, label: "Tenants", icon: Building2 },
      { value: "integrations" as const, label: "Customer Integrations", icon: Cable },
      { value: "messaging" as const, label: "Messaging", icon: MessageSquareText },
      { value: "unblock-users" as const, label: "Unblock Users", icon: UserRoundCheck },
      { value: "user-activity" as const, label: "User Activity", icon: Activity },
      { value: "import-runs" as const, label: "Import Runs", icon: FileClock },
    ],
  },
  {
    label: "System",
    items: [
      { value: "delivery-issues" as const, label: "Delivery Issues", icon: ShieldAlert },
      { value: "support-reports" as const, label: "Support Reports", icon: LifeBuoy },
    ],
  },
];

interface AdminWorkspaceShellProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  children: ReactNode;
  title?: string;
}

const AdminNavigation = ({
  activeSection,
  onSelect,
}: {
  activeSection: AdminSection;
  onSelect: (section: AdminSection) => void;
}) => (
  <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5" aria-label="Admin workspace">
    {groups.map((group) => (
      <div key={group.label}>
        <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
          {group.label}
        </div>
        <div className="space-y-0.5">
          {group.items.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant="ghost"
              onClick={() => onSelect(item.value)}
              className={cn(
                "w-full h-10 justify-start gap-3 px-3 rounded-md text-sm font-medium",
                activeSection === item.value
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold hover:bg-sidebar-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-[19px] w-[19px] shrink-0" strokeWidth={2} />
              <span className="truncate">{item.label}</span>
            </Button>
          ))}
        </div>
      </div>
    ))}
  </nav>
);

export default function AdminWorkspaceShell({
  activeSection,
  onSectionChange,
  children,
  title = "Admin",
}: AdminWorkspaceShellProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const selectSection = (section: AdminSection) => {
    onSectionChange(section);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background md:pl-[232px]">
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-[232px] flex-col border-r border-sidebar-border bg-sidebar">
        <div className="px-5 pt-5 pb-1"><AppLogo /></div>
        <div className="px-6 pb-5 text-xs font-semibold text-muted-foreground">Admin workspace</div>
        <AdminNavigation activeSection={activeSection} onSelect={onSectionChange} />
        <div className="border-t border-border px-3 py-3">
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={() => navigate("/dashboard")}>
            <ArrowLeftRight className="h-5 w-5" /> Back to Office
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setMenuOpen(true)} aria-label="Open Admin navigation">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="md:hidden"><AppLogo /></div>
        <div className="hidden md:block min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Admin workspace</div>
          <h1 className="truncate text-lg font-bold text-foreground">{title}</h1>
        </div>
        <div className="ml-auto md:hidden text-sm font-bold text-foreground truncate">{title}</div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[292px] p-0 flex flex-col">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <div className="px-5 pt-5 pb-1"><AppLogo /></div>
          <div className="px-6 pb-5 text-xs font-semibold text-muted-foreground">Admin workspace</div>
          <AdminNavigation activeSection={activeSection} onSelect={selectSection} />
          <div className="border-t border-border px-3 py-3">
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={() => navigate("/dashboard")}>
              <ArrowLeftRight className="h-5 w-5" /> Back to Office
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="min-w-0">{children}</main>
    </div>
  );
}