import { useState, useMemo } from "react";
import { Inbox, Receipt, RefreshCw, Shield } from "lucide-react";
import IncomingJobs from "./IncomingJobs";
import QuotesList from "./QuotesList";
import Renewals from "./Renewals";
import WarrantyTracker from "./WarrantyTracker";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

const BASE_TABS: { key: string; label: string; icon: React.ComponentType<any> }[] = [
  { key: "incoming", label: "Incoming", icon: Inbox },
  { key: "quotes", label: "Quotes", icon: Receipt },
  { key: "renewals", label: "Renewals", icon: RefreshCw },
];

const WARRANTY_TAB = { key: "warranty", label: "Warranty", icon: Shield };

type TabKey = "incoming" | "quotes" | "renewals" | "warranty";

const Pipeline = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("incoming");
  const { user } = useAuth();
  const { isAdmin, isOffice } = useUserRole(user);

  const tabs = useMemo(() => {
    const t = [...BASE_TABS];
    if (isAdmin || isOffice) t.push(WARRANTY_TAB);
    return t;
  }, [isAdmin, isOffice]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold text-foreground">Pipeline</h1>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
                active
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content — each page renders its own layout */}
      <div className="-mx-4 sm:-mx-6 -mt-6">
        {activeTab === "incoming" && <IncomingJobs />}
        {activeTab === "quotes" && <QuotesList />}
        {activeTab === "renewals" && <Renewals />}
        {activeTab === "warranty" && <WarrantyTracker />}
      </div>
    </div>
  );
};

export default Pipeline;
