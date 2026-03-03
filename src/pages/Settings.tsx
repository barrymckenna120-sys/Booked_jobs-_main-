import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, MessageCircle, Building2, Bell, Shield, Database, Loader2, Wrench, Users, ClipboardList } from "lucide-react";
import GeneralTab from "@/components/settings/GeneralTab";
import WhatsAppTab from "@/components/settings/WhatsAppTab";
import BusinessProfileTab from "@/components/settings/BusinessProfileTab";
import RemindersTab from "@/components/settings/RemindersTab";
import SecurityTab from "@/components/settings/SecurityTab";
import DataTab from "@/components/settings/DataTab";
import EngineerAvailabilityTab from "@/components/settings/EngineerAvailabilityTab";
import TeamManagementTab from "@/components/settings/TeamManagementTab";
import AuditLogTab from "@/components/settings/AuditLogTab";

const TABS = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "engineers", label: "Engineers", icon: Wrench },
  { key: "team", label: "Team", icon: Users },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "business", label: "Business", icon: Building2 },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "data", label: "Data", icon: Database },
  { key: "security", label: "Security", icon: Shield },
  { key: "audit", label: "Audit Log", icon: ClipboardList },
];

const Settings = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const handleSave = async (fields: Record<string, any>) => {
    if (!user) return;
    setSaving(true);
    try {
      if (settings?.id) {
        const { error } = await supabase
          .from("settings")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ ...fields, user_id: user.id });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold text-foreground mb-6">Settings</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar tabs (desktop) / Horizontal tabs (mobile) */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-border pb-2 md:pb-0 md:pr-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === "general" && <GeneralTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "engineers" && <EngineerAvailabilityTab />}
          {activeTab === "team" && <TeamManagementTab />}
          {activeTab === "whatsapp" && <WhatsAppTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "business" && <BusinessProfileTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "reminders" && <RemindersTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "data" && <DataTab />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "audit" && <AuditLogTab />}
        </div>
      </div>
    </div>
  );
};

export default Settings;
