import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Pencil,
  Trash2,
  Save,
  X,
  Plus,
  Ban,
  Power,
} from "lucide-react";

type Org = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string | null;
  bookedjobs_plan: string | null;
  created_at: string;
  is_archived: boolean | null;
  archived_at: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
};

type Integration = {
  id: string;
  organisation_id: string;
  integration_type: string;
  config: Record<string, any> | null;
  is_active?: boolean | null;
};

type SettingsRow = {
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  company_name: string | null;
  company_phone: string | null;
  owner_name: string | null;
};

const SENSITIVE_KEY_RE = /(api[_-]?key|secret|token|password|auth)/i;
const INTEGRATION_TYPES = [
  "whatsapp_360",
  "360messenger",
  "stripe",
  "resend",
  "tally",
  "cloudinary",
];

const maskValue = (key: string, val: any): string => {
  if (val == null) return "—";
  const str = String(val);
  if (SENSITIVE_KEY_RE.test(key) && str.length > 4) {
    return `••••${str.slice(-4)}`;
  }
  return str;
};

export default function TenantDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { setViewingOrg } = useAdminViewAs();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Org | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

  // Settings edit
  const [editingSettings, setEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    business_name: "",
    owner_name: "",
    owner_email: "",
    phone: "",
  });

  // Per-integration edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add integration
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<string>("whatsapp_360");
  const [addJson, setAddJson] = useState("{\n  \n}");
  const [addActive, setAddActive] = useState(true);
  const [addSaving, setAddSaving] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTyped, setArchiveTyped] = useState("");
  const [archiving, setArchiving] = useState(false);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspending, setSuspending] = useState(false);

  const [sendingReset, setSendingReset] = useState(false);

  // Access check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) navigate("/dashboard", { replace: true });
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role" as any)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if ((data as any)?.role !== "superadmin") {
        navigate("/dashboard", { replace: true });
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const loadAll = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data: orgRow, error: orgErr } = await supabase
        .from("organisations")
        .select(
          "id, name, slug, subscription_status, bookedjobs_plan, created_at, is_archived, archived_at, owner_user_id, owner_name, owner_phone" as any,
        )
        .eq("id", orgId)
        .maybeSingle();
      if (orgErr) throw orgErr;
      setOrg(orgRow as any);

      const { data: ints } = await supabase
        .from("tenant_integrations" as any)
        .select("id, organisation_id, integration_type, config, is_active")
        .eq("organisation_id", orgId)
        .order("integration_type");
      setIntegrations(((ints as any[]) || []) as Integration[]);

      const { data: settingsRow } = await supabase
        .from("settings")
        .select("business_name, business_email, business_phone, company_name, company_phone, owner_name")
        .eq("organisation_id", orgId)
        .maybeSingle();
      setSettings((settingsRow as any) || null);

      // Owner email via list-users edge fn
      let resolvedEmail: string | null = null;
      const ownerUserId = (orgRow as any)?.owner_user_id;
      if (ownerUserId) {
        try {
          const { data: usersResp } = await invokeFunction("list-users");
          const users = (usersResp as any)?.users || [];
          const u = users.find((u: any) => u?.id === ownerUserId);
          resolvedEmail = u?.email || null;
        } catch (_e) {
          resolvedEmail = null;
        }
      }
      setOwnerEmail(resolvedEmail);

      const s = (settingsRow as any) || {};
      setSettingsForm({
        business_name: s.business_name || s.company_name || "",
        owner_name: s.owner_name || (orgRow as any)?.owner_name || "",
        owner_email: resolvedEmail || s.business_email || "",
        phone: s.business_phone || s.company_phone || (orgRow as any)?.owner_phone || "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tenant");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authChecked) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, orgId]);

  const saveSettings = async () => {
    if (!orgId) return;
    setSavingSettings(true);
    try {
      const payload: Record<string, any> = {
        business_name: settingsForm.business_name || null,
        owner_name: settingsForm.owner_name || null,
        business_email: settingsForm.owner_email || null,
        business_phone: settingsForm.phone || null,
      };
      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("organisation_id", orgId)
        .maybeSingle();
      let error;
      if (existing?.id) {
        ({ error } = await supabase
          .from("settings")
          .update(payload)
          .eq("organisation_id", orgId));
      } else {
        ({ error } = await supabase
          .from("settings")
          .insert({ ...payload, organisation_id: orgId } as any));
      }
      if (error) throw error;
      toast.success("Settings updated");
      setEditingSettings(false);
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const startEdit = (i: Integration) => {
    setEditingId(i.id);
    setEditJson(JSON.stringify(i.config ?? {}, null, 2));
    setEditActive(i.is_active !== false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditJson("");
  };

  const saveEdit = async (i: Integration) => {
    let parsed: any;
    try {
      parsed = JSON.parse(editJson);
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("tenant_integrations" as any)
        .update({ config: parsed, is_active: editActive })
        .eq("id", i.id);
      if (error) throw error;
      toast.success("Integration updated");
      setEditingId(null);
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteIntegration = async (i: Integration) => {
    if (!confirm(`Delete the "${i.integration_type}" integration?`)) return;
    setDeletingId(i.id);
    try {
      const { error } = await supabase
        .from("tenant_integrations" as any)
        .delete()
        .eq("id", i.id);
      if (error) throw error;
      toast.success("Integration deleted");
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddIntegration = async () => {
    if (!orgId) return;
    let parsed: any;
    try {
      parsed = JSON.parse(addJson);
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    setAddSaving(true);
    try {
      const { error } = await supabase
        .from("tenant_integrations" as any)
        .insert({
          organisation_id: orgId,
          integration_type: addType,
          config: parsed,
          is_active: addActive,
        });
      if (error) throw error;
      toast.success("Integration added");
      setAddOpen(false);
      setAddType("whatsapp_360");
      setAddJson("{\n  \n}");
      setAddActive(true);
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAddSaving(false);
    }
  };

  const handleSendReset = async () => {
    if (!ownerEmail) {
      toast.error("Owner email unavailable");
      return;
    }
    setSendingReset(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reset-email", {
        body: { email: ownerEmail },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed");
      }
      toast.success(`Password reset sent to ${ownerEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset");
    } finally {
      setSendingReset(false);
    }
  };

  const handleArchive = async () => {
    if (!org) return;
    if (archiveTyped.trim() !== org.name) return;
    setArchiving(true);
    try {
      const { error } = await supabase
        .from("organisations")
        .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
        .eq("id", org.id);
      if (error) throw error;
      toast.success("Organisation archived");
      setArchiveOpen(false);
      setArchiveTyped("");
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setArchiving(false);
    }
  };

  const handleSuspend = async () => {
    if (!org) return;
    setSuspending(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-tenant-status", {
        body: { organisation_id: org.id, status: "suspended" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Tenant suspended");
      setSuspendOpen(false);
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to suspend");
    } finally {
      setSuspending(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!org) return;
    setSuspending(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-tenant-status", {
        body: { organisation_id: org.id, status: "active" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Tenant reactivated");
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reactivate");
    } finally {
      setSuspending(false);
    }
  };

  const handleSwitchContext = () => {
    if (!org) return;
    setViewingOrg(org.id, org.name);
    toast.success(`Switched to ${org.name}`);
    navigate("/dashboard");
  };

  if (!authChecked) return null;

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="container mx-auto max-w-5xl p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin
        </Button>
        <p className="text-muted-foreground">Tenant not found.</p>
      </div>
    );
  }

  const archived = !!org.is_archived;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-2xl">{org.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{org.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              {archived ? (
                <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200" variant="secondary">
                  Archived
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100" variant="secondary">
                  {org.subscription_status || "active"}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Plan</div>
              <div className="font-medium">{org.bookedjobs_plan || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Created</div>
              <div className="font-medium">
                {new Date(org.created_at).toLocaleDateString("en-IE")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Archived at</div>
              <div className="font-medium">
                {org.archived_at ? new Date(org.archived_at).toLocaleString("en-IE") : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Settings Summary</CardTitle>
            {!editingSettings ? (
              <Button size="sm" variant="outline" onClick={() => setEditingSettings(true)}>
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingSettings(false);
                    // reset form from current state
                    setSettingsForm({
                      business_name: settings?.business_name || settings?.company_name || "",
                      owner_name: settings?.owner_name || org.owner_name || "",
                      owner_email: ownerEmail || settings?.business_email || "",
                      phone:
                        settings?.business_phone || settings?.company_phone || org.owner_phone || "",
                    });
                  }}
                  disabled={savingSettings}
                >
                  <X className="mr-1 h-3 w-3" /> Cancel
                </Button>
                <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3 w-3" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Business Name</Label>
              {editingSettings ? (
                <Input
                  value={settingsForm.business_name}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, business_name: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="font-medium mt-1">
                  {settings?.business_name || settings?.company_name || org.name}
                </div>
              )}
            </div>
            <div>
              <Label className="text-muted-foreground">Owner</Label>
              {editingSettings ? (
                <Input
                  value={settingsForm.owner_name}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, owner_name: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="font-medium mt-1">
                  {settings?.owner_name || org.owner_name || "—"}
                </div>
              )}
            </div>
            <div>
              <Label className="text-muted-foreground">Owner Email</Label>
              {editingSettings ? (
                <Input
                  type="email"
                  value={settingsForm.owner_email}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, owner_email: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="font-medium mt-1">
                  {ownerEmail || settings?.business_email || "—"}
                </div>
              )}
            </div>
            <div>
              <Label className="text-muted-foreground">Phone</Label>
              {editingSettings ? (
                <Input
                  value={settingsForm.phone}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, phone: e.target.value })
                  }
                  className="mt-1"
                />
              ) : (
                <div className="font-medium mt-1">
                  {settings?.business_phone || settings?.company_phone || org.owner_phone || "—"}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Integrations</CardTitle>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Add Integration
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No integrations configured.</p>
          ) : (
            <div className="space-y-4">
              {integrations.map((i) => {
                const isEditing = editingId === i.id;
                const active = i.is_active !== false;
                return (
                  <div key={i.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{i.integration_type}</h3>
                        <Badge
                          variant="secondary"
                          className={
                            active
                              ? "bg-green-100 text-green-800 hover:bg-green-100"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {!isEditing ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(i)}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteIntegration(i)}
                            disabled={deletingId === i.id}
                          >
                            {deletingId === i.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3 w-3" />
                            )}
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                          >
                            <X className="mr-1 h-3 w-3" /> Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEdit(i)}
                            disabled={savingEdit}
                          >
                            {savingEdit ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="mr-1 h-3 w-3" />
                            )}
                            Save
                          </Button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`active-${i.id}`}
                            checked={editActive}
                            onCheckedChange={setEditActive}
                          />
                          <Label htmlFor={`active-${i.id}`}>Active</Label>
                        </div>
                        <Textarea
                          value={editJson}
                          onChange={(e) => setEditJson(e.target.value)}
                          rows={8}
                          className="font-mono text-xs"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-sm">
                        {Object.entries(i.config ?? {}).length === 0 ? (
                          <p className="text-muted-foreground italic">No config</p>
                        ) : (
                          Object.entries(i.config ?? {}).map(([k, v]) => (
                            <div key={k} className="flex gap-3">
                              <div className="text-muted-foreground min-w-[140px]">{k}</div>
                              <div className="font-mono text-xs break-all">
                                {maskValue(k, v)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleSendReset}
              disabled={!ownerEmail || sendingReset}
            >
              {sendingReset ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send Password Recovery
            </Button>
            <Button variant="secondary" onClick={handleSwitchContext}>
              Switch Context
            </Button>
            {org.subscription_status === "suspended" ? (
              <Button
                variant="outline"
                onClick={handleUnsuspend}
                disabled={suspending}
              >
                {suspending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Power className="mr-2 h-4 w-4" />
                )}
                Unsuspend
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setSuspendOpen(true)}
                disabled={suspending || archived}
              >
                <Ban className="mr-2 h-4 w-4" /> Suspend
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={archived}
              onClick={() => {
                setArchiveOpen(true);
                setArchiveTyped("");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Archive Organisation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add integration dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !addSaving) setAddOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Integration type</Label>
              <Select value={addType} onValueChange={setAddType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTEGRATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Config (JSON)</Label>
              <Textarea
                value={addJson}
                onChange={(e) => setAddJson(e.target.value)}
                rows={8}
                className="font-mono text-xs mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="add-active"
                checked={addActive}
                onCheckedChange={setAddActive}
              />
              <Label htmlFor="add-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleAddIntegration} disabled={addSaving}>
              {addSaving ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open && !archiving) {
            setArchiveOpen(false);
            setArchiveTyped("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Archive {org.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archive-name">
              Type the organisation name to confirm archiving
            </Label>
            <Input
              id="archive-name"
              value={archiveTyped}
              onChange={(e) => setArchiveTyped(e.target.value)}
              placeholder={org.name}
              disabled={archiving}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveOpen(false);
                setArchiveTyped("");
              }}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={archiving || archiveTyped.trim() !== org.name}
            >
              {archiving ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Archiving…
                </>
              ) : (
                "Archive Organisation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend confirm */}
      <Dialog
        open={suspendOpen}
        onOpenChange={(open) => {
          if (!open && !suspending) setSuspendOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" /> Suspend {org.name}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            They will lose access immediately.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspendOpen(false)}
              disabled={suspending}
            >
              Cancel
            </Button>
            <Button onClick={handleSuspend} disabled={suspending}>
              {suspending ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Suspending…
                </>
              ) : (
                "Suspend"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
