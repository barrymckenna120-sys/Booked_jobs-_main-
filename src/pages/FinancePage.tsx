import { useState } from "react";
import { FileText, CreditCard, Scale, BookOpen } from "lucide-react";
import Finance from "./Finance";
import SalesLedger from "./SalesLedger";

const TABS = [
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "balances", label: "Balances", icon: Scale },
  { key: "sales-ledger", label: "Sales Ledger", icon: BookOpen },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const FinancePage = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("invoices");

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
      <div>
        {activeTab === "invoices" && <Finance embedded />}
        {activeTab === "payments" && <Finance embedded defaultView="payments" />}
        {activeTab === "balances" && <Finance embedded defaultView="balances" />}
        {activeTab === "sales-ledger" && <SalesLedger embedded />}
      </div>
    </div>
  );
};

export default FinancePage;
