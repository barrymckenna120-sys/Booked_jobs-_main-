import { useState } from "react";
import { CreditCard, BookOpen, XCircle } from "lucide-react";
import Finance from "./Finance";
import SalesLedger from "./SalesLedger";
import DeclinedPayments from "./DeclinedPayments";

const TABS = [
  { key: "overview", label: "Overview", icon: CreditCard },
  { key: "sales-ledger", label: "Sales", icon: BookOpen },
  { key: "declined", label: "Declined", icon: XCircle },
] as const;

type TabKey = (typeof TABS)[number]["key"];


const FinancePage = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold text-foreground">Finance</h1>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

      {/* Content */}
      <div className="-mx-4 sm:-mx-6 -mt-6">
        {activeTab === "overview" && <Finance />}
        {activeTab === "sales-ledger" && <SalesLedger />}
        {activeTab === "declined" && <DeclinedPayments />}

      </div>
    </div>
  );
};

export default FinancePage;
