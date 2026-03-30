import { useState } from "react";
import { MessageSquare, MessageCircle } from "lucide-react";
import Messages from "./Messages";
import WhatsApp from "./WhatsApp";

const TABS = [
  { key: "internal", label: "Internal Messages", icon: MessageSquare },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const Inbox = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("internal");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <h1 className="text-2xl font-extrabold text-foreground">Inbox</h1>

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

      <div className="-mx-4 sm:-mx-6 -mt-6">
        {activeTab === "internal" && <Messages />}
        {activeTab === "whatsapp" && <WhatsApp />}
      </div>
    </div>
  );
};

export default Inbox;
