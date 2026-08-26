import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrgId } from "@/hooks/useOrgId";
import { playDoubleBeep, playSoftChime, playEngineerMessageAlert, isAudioUnlocked, getAudioContextState, unlockAudioNow } from "@/utils/audio";
import { useNotifications } from "@/hooks/useNotifications";
import { toast as sonnerToast } from "sonner";
import {
  Settings as SettingsIcon, MessageCircle, Bell, Shield,
  Loader2, Users, ClipboardList, FileText, Plug, Receipt, Palette, Package, Flame, Volume2,
} from "lucide-react";
import Products from "@/pages/Products";
import GeneralTab from "@/components/settings/GeneralTab";
import RemindersTab from "@/components/settings/RemindersTab";
import SecurityTab from "@/components/settings/SecurityTab";
import DataTab from "@/components/settings/DataTab";
import EngineerAvailabilityTab from "@/components/settings/EngineerAvailabilityTab";
import TeamManagementTab from "@/components/settings/TeamManagementTab";
import AuditLogTab from "@/components/settings/AuditLogTab";
import QuoteDefaultsTab from "@/components/settings/QuoteDefaultsTab";
import BrandTab from "@/components/settings/BrandTab";
import MessagingTab from "@/components/settings/MessagingTab";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import BillingTab from "@/components/settings/BillingTab";
import BoilerBrandsTab from "@/components/settings/BoilerBrandsTab";
import FinanceTab from "@/components/settings/FinanceTab";
import ReceiptsTab from "@/components/settings/ReceiptsTab";
import JobTimeBlocksSection from "@/components/settings/JobTimeBlocksSection";
import { Separator } from "@/components/ui/separator";

const TABS = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "products", label: "Products", icon: Package },
  { key: "brand", label: "Brand", icon: Palette },
  { key: "team", label: "Team & Users", icon: Users },
  { key: "messaging", label: "Messaging", icon: MessageCircle },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "quote_defaults", label: "Quote & Invoice Defaults", icon: FileText },
  { key: "finance", label: "Finance & Reporting", icon: Receipt },
  { key: "receipts", label: "Receipts", icon: Receipt },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "data_security", label: "Data & Security", icon: Shield },
  { key: "billing", label: "Billing", icon: Receipt },
  { key: "boiler_brands", label: "Boiler Brands", icon: Flame },
  { key: "audit", label: "Audit Log", icon: ClipboardList },
];

const Settings = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [, forceTick] = useState(0);
  const { soundEnabled, enableSound } = useNotifications();
  const audioUnlocked = isAudioUnlocked();
  const ctxState = getAudioContextState();

  const { orgId } = useOrgId();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("*")
        .eq("organisation_id", orgId!)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !!orgId,
    staleTime: 0,
    gcTime: 0,
  });

  const handleSave = async (fields: Record<string, any>) => {
    if (!user || !orgId) {
      toast({
        title: "Could not resolve your organisation",
        description: "Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }
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
          .insert({ ...fields, user_id: user.id, organisation_id: orgId });
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

  if (authLoading || !orgId || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold text-foreground mb-3">Settings</h1>

      {/* Sound alerts status + diagnostics */}
      <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30 space-y-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Sound alerts</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2 rounded-md bg-background border border-border">
            <div className="text-muted-foreground">Sound alerts enabled</div>
            <div className={`font-bold ${soundEnabled ? "text-green-600" : "text-red-600"}`}>
              {soundEnabled === null ? "Loading…" : soundEnabled ? "Yes" : "No"}
            </div>
          </div>
          <div className="p-2 rounded-md bg-background border border-border">
            <div className="text-muted-foreground">Audio unlocked</div>
            <div className={`font-bold ${audioUnlocked ? "text-green-600" : "text-amber-600"}`}>
              {audioUnlocked ? "Yes" : "No — tap Enable"}
            </div>
          </div>
          <div className="p-2 rounded-md bg-background border border-border">
            <div className="text-muted-foreground">AudioContext state</div>
            <div className={`font-bold ${ctxState === "running" ? "text-green-600" : "text-amber-600"}`}>
              {ctxState}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const res = await unlockAudioNow();
              forceTick((t) => t + 1);
              if (res.ok) sonnerToast.success("Audio unlocked");
              else sonnerToast.error("Could not unlock audio", { description: `${res.reason} (state: ${res.state})` });
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Enable sound alerts
          </button>
          <button
            type="button"
            onClick={() => enableSound(!soundEnabled)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-background hover:bg-muted"
          >
            {soundEnabled ? "Turn off sound alerts" : "Turn on sound alerts"}
          </button>
          <span className="text-xs text-muted-foreground mx-1">Test:</span>
          <button
            type="button"
            onClick={async () => {
              console.log("[test] Double beep button clicked");
              const r = await playDoubleBeep();
              forceTick((t) => t + 1);
              if (!r.played) sonnerToast.warning("Sound blocked", { description: `${r.reason} (state: ${r.state})` });
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-background hover:bg-muted"
          >
            Double beep (jobs)
          </button>
          <button
            type="button"
            onClick={async () => {
              console.log("[test] Soft chime button clicked");
              const r = await playSoftChime();
              forceTick((t) => t + 1);
              if (!r.played) sonnerToast.warning("Sound blocked", { description: `${r.reason} (state: ${r.state})` });
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-background hover:bg-muted"
          >
            Soft chime (completed)
          </button>
          <button
            type="button"
            onClick={async () => {
              console.log("[test] Message alert button clicked");
              const r = await playEngineerMessageAlert();
              forceTick((t) => t + 1);
              if (!r.played) sonnerToast.warning("Sound blocked", { description: `${r.reason} (state: ${r.state})` });
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-background hover:bg-muted"
          >
            Message alert
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Sound only works while the app is open. For alerts when the app is
          closed or backgrounded, enable push notifications on this device.
        </p>
      </div>


      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar tabs (desktop) / Horizontal tabs (mobile) */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-border pb-2 md:pb-0 md:pr-4">
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
          {activeTab === "products" && <Products />}
          {activeTab === "brand" && <BrandTab />}
          {activeTab === "team" && (
            <div className="space-y-8">
              <TeamManagementTab />
              <Separator />
              <div>
                <h2 className="text-lg font-extrabold text-foreground mb-1">Engineer Availability</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Set working days and manage time-off for your engineers.
                </p>
                <EngineerAvailabilityTab />
              </div>
              <Separator />
              <div>
                <h2 className="text-lg font-extrabold text-foreground mb-1">Job Time Blocks</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Define scheduling blocks and maximum jobs per block for each time slot.
                </p>
                <JobTimeBlocksSection settings={settings} onSave={handleSave} saving={saving} />
              </div>
            </div>
          )}
          {activeTab === "messaging" && <MessagingTab settings={settings} onSave={handleSave} saving={saving} onNavigateToTab={setActiveTab} />}
          {activeTab === "reminders" && <RemindersTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "quote_defaults" && <QuoteDefaultsTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "finance" && <FinanceTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "receipts" && <ReceiptsTab settings={settings} onSave={handleSave} saving={saving} />}
          {activeTab === "integrations" && <IntegrationsTab />}
          {activeTab === "data_security" && (
            <div className="space-y-8">
              <DataTab />
              <Separator />
              <SecurityTab />
            </div>
          )}
          {activeTab === "billing" && <BillingTab />}
          {activeTab === "boiler_brands" && <BoilerBrandsTab />}
          {activeTab === "audit" && <AuditLogTab />}
        </div>
      </div>
    </div>
  );
};

export default Settings;
