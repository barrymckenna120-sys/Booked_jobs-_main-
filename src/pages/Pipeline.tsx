import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Inbox, Receipt, RefreshCw, Shield, Flame, ChevronLeft } from "lucide-react";
import IncomingJobs from "./IncomingJobs";
import BoilerEnquiries from "./BoilerEnquiries";
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

const LEADS_TAB = { key: "leads", label: "Leads", icon: Flame };

const WARRANTY_TAB = { key: "warranty", label: "Warranty", icon: Shield };

type TabKey = "incoming" | "leads" | "quotes" | "renewals" | "warranty";

const Pipeline = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get("filter");
  const initialTab: TabKey = (filterParam === "overdue" || filterParam === "due-soon") ? "renewals" : "incoming";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const { user } = useAuth();
  const { role, canAccessOffice, isAdmin, isOffice } = useUserRole(user);
  // Leads (Boiler Enquiries) uses the same office-access predicate as the
  // OfficeRoute guard on the standalone /boiler-enquiries page, so an account
  // that can open the page directly also sees the tab here. Owner/manager
  // accounts resolve to neither isAdmin nor isOffice, so isAdmin || isOffice
  // would hide the tab from them (it already hides Warranty).
  const canSeeOfficeTabs = role !== "engineer" || canAccessOffice;

  const tabs = useMemo(() => {
    const t = [...BASE_TABS];
    if (canSeeOfficeTabs) t.splice(1, 0, LEADS_TAB);
    if (isAdmin || isOffice) t.push(WARRANTY_TAB);
    return t;
  }, [isAdmin, isOffice, canSeeOfficeTabs]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <button
        onClick={() => navigate("/dashboard")}
        className="md:hidden inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors -mb-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
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
        {activeTab === "leads" && <BoilerEnquiries />}
        {activeTab === "quotes" && <QuotesList />}
        {activeTab === "renewals" && <Renewals />}
        {activeTab === "warranty" && <WarrantyTracker />}
      </div>
    </div>
  );
};

export default Pipeline;
