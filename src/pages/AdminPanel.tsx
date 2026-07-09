import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import CustomerIntegrationsTab from "@/components/admin/CustomerIntegrationsTab";
import { toast } from "sonner";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { Loader2, History, Ban, ShieldCheck, Trash2, Unlock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  industry: string | null;
  created_at: string;
  owner_user_id: string | null;
  is_blocked: boolean | null;
  is_archived?: boolean | null;
  archived_at?: string | null;
};

type ActivityEntry = {
  id: string;
  organisation_id: string | null;
  event_type: string;
  performed_by: string | null;
  note: string | null;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  magic_link_sent: "Magic link sent",
  access_blocked: "Access blocked",
  access_unblocked: "Access unblocked",
};

const formatActivityTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Dublin",
  });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const StatusBadge = ({ status }: { status: string | null }) => {
  const s = (status || "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-green-100 text-green-800 hover:bg-green-100"
      : s === "suspended"
      ? "bg-red-100 text-red-800 hover:bg-red-100"
      : s === "trial"
      ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
      : "bg-muted text-muted-foreground";
  return <Badge className={cls} variant="secondary">{status || "—"}</Badge>;
};

type OrgUser = { userId: string; email: string | null; name: string; role: string; blocked?: boolean };

function UnblockUserPopover({
  orgId,
  ownerEmails,
  unblockingEmail,
  onUnblock,
  hasBlockedUsers = false,
  checkingBlocked = false,
  closeSignal = 0,
}: {
  orgId: string;
  ownerEmails: Record<string, string>;
  unblockingEmail: string | null;
  onUnblock: (email: string) => Promise<void> | void;
  hasBlockedUsers?: boolean;
  checkingBlocked?: boolean;
  closeSignal?: number;
}) {

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);

  useEffect(() => {
    if (closeSignal > 0) setOpen(false);
  }, [closeSignal]);


  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("list-users", {
          body: { org_id: orgId },
        });
        if (cancelled) return;
        if (invokeError || (data as any)?.error) {
          console.error("[list-users] error:", invokeError,
            "data error:", (data as any)?.error,
            "org_id:", orgId);
          setError("Failed to load users for this organisation");
          setUsers([]);
          return;
        }
        const rawList = ((data as any)?.users as any[]) || [];
        const ownerEmail = (ownerEmails?.[orgId] || "").toLowerCase();

        // Normalise to a common shape — the org-scoped EF returns
        // { userId, email, name, role } while the default branch (or older
        // deploys) returns { id, email, ... }.
        const normalised = rawList
          .map((item: any) => {
            const userId = item?.userId ?? item?.id ?? null;
            const email = item?.email ?? null;
            return {
              userId,
              email,
              name: item?.name || email || "—",
              role: item?.role || "—",
              blocked: !!item?.blocked,
              organisation_id: item?.organisation_id ?? null,
            };
          })
          .filter((u) => !!u.userId && !!u.email);


        // If the response already looks org-scoped (has name/role fields),
        // trust it. Otherwise fall back to a client-side filter so we don't
        // display every platform auth user by accident.
        const looksOrgScoped = rawList.some(
          (item: any) => item && ("name" in item || "role" in item)
        );

        const finalList = looksOrgScoped
          ? normalised
          : normalised.filter(
              (u) =>
                (u.organisation_id && u.organisation_id === orgId) ||
                (ownerEmail && u.email?.toLowerCase() === ownerEmail)
            );

        setUsers(finalList as OrgUser[]);
      } catch (_e) {
        if (!cancelled) {
          setError("Failed to load users for this organisation");
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, ownerEmails]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={hasBlockedUsers ? "destructive" : "outline"}
          disabled={checkingBlocked}
          title="Unblock a user in this organisation"
        >
          {checkingBlocked ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Unlock className="mr-1 h-3 w-3" />
          )}
          Unblock User
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-2" align="end">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1">
          Select a user to clear their auth block
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading users…
          </div>
        ) : error ? (
          <div className="px-2 py-3 text-sm text-red-600">{error}</div>
        ) : users.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            No users found for this organisation
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {users.map((u) => {
              const busy = unblockingEmail !== null;
              const isThisOne = unblockingEmail === u.email;
              const disabled = !u.email || busy;
              const blocked = !!u.blocked;
              return (
                <button
                  key={u.userId || u.email || u.name}
                  type="button"
                  disabled={disabled}
                  onClick={() => u.email && onUnblock(u.email)}
                  className={`w-full text-left px-2 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2 border-l-4 ${
                    blocked
                      ? "bg-red-50 border-red-500 hover:bg-red-100"
                      : "border-transparent hover:bg-muted"
                  }`}
                  title={u.email || "Email unavailable"}
                >
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${blocked ? "text-red-700" : "text-muted-foreground"}`}>
                      {u.name}
                    </div>
                    <div className={`text-xs truncate ${blocked ? "text-red-600" : "text-muted-foreground"}`}>
                      {u.email || "email unavailable"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                    {blocked ? (
                      <Badge className="text-[10px] bg-red-100 text-red-800 hover:bg-red-100" variant="secondary">
                        Blocked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                        Active
                      </Badge>
                    )}
                    {isThisOne && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>
                </button>
              );
            })}

          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}



export default function AdminPanel() {
  const navigate = useNavigate();
  const { setViewingOrg, viewingOrgId } = useAdminViewAs();
  const [authChecked, setAuthChecked] = useState(false);

  // On mount, push the currently selected org override into the Supabase session
  // so all subsequent queries resolve data for the selected tenant.
  useEffect(() => {
    if (!viewingOrgId) return;
    supabase.rpc('set_config' as any, {
      key: 'app.current_org_id',
      value: viewingOrgId,
      is_local: false,
    } as any).then(({ error }) => {
      if (error) console.error('set_config (mount) failed:', error);
    });
  }, [viewingOrgId]);

  // form state
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [jobReferencePrefix, setJobReferencePrefix] = useState("");
  const [prefixDirty, setPrefixDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // tenants
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [ownerEmails, setOwnerEmails] = useState<Record<string, string>>({});
  const [unblockingEmail, setUnblockingEmail] = useState<string | null>(null);
  const [sendingMagicLinkFor, setSendingMagicLinkFor] = useState<string | null>(null);
  const [togglingBlockFor, setTogglingBlockFor] = useState<string | null>(null);
  const [latestActivity, setLatestActivity] = useState<Record<string, ActivityEntry>>({});
  const [activityModalOrg, setActivityModalOrg] = useState<Tenant | null>(null);
  const [tabValue, setTabValue] = useState<string>("tenants");
  const [blockedStatus, setBlockedStatus] = useState<Record<string, { loading: boolean; hasBlocked: boolean }>>({});
  const [blockedStatusFetched, setBlockedStatusFetched] = useState(false);
  const [closeSignals, setCloseSignals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tabValue !== "unblock-users" || blockedStatusFetched || tenants.length === 0) return;
    setBlockedStatusFetched(true);
    setBlockedStatus((prev) => {
      const next = { ...prev };
      for (const t of tenants) next[t.id] = { loading: true, hasBlocked: false };
      return next;
    });
    (async () => {
      await Promise.all(
        tenants.map(async (t) => {
          try {
            const { data, error } = await supabase.functions.invoke("list-users", {
              body: { org_id: t.id },
            });
            const users = ((data as any)?.users as any[]) || [];
            const hasBlocked = !error && !(data as any)?.error && users.some((u) => !!u?.blocked);
            setBlockedStatus((prev) => ({ ...prev, [t.id]: { loading: false, hasBlocked } }));
          } catch {
            setBlockedStatus((prev) => ({ ...prev, [t.id]: { loading: false, hasBlocked: false } }));
          }
        })
      );
    })();
  }, [tabValue, tenants, blockedStatusFetched]);

  const [activityModalEntries, setActivityModalEntries] = useState<ActivityEntry[]>([]);
  const [loadingActivityModal, setLoadingActivityModal] = useState(false);
  const [blockModalTenant, setBlockModalTenant] = useState<Tenant | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [archiveModalTenant, setArchiveModalTenant] = useState<Tenant | null>(null);
  const [archiveTypedName, setArchiveTypedName] = useState("");
  const [archiving, setArchiving] = useState(false);

  // Access check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) navigate("/dashboard", { replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("role" as any)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = (data as any)?.role;
      if (error || role !== "superadmin") {
        navigate("/dashboard", { replace: true });
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const loadTenants = async () => {
    setLoadingTenants(true);
    const { data } = await supabase
      .from("organisations")
      .select("id, name, slug, subscription_status, owner_name, owner_phone, industry, created_at, owner_user_id, is_blocked, is_archived, archived_at" as any)
      .order("created_at", { ascending: false });
    const list = (data as any[]) || [];
    setTenants(list as any);
    setLoadingTenants(false);

    // Fetch owner emails via list-users edge function
    try {
      const { data: usersResp } = await supabase.functions.invoke("list-users");
      const users = (usersResp as any)?.users || [];
      const map: Record<string, string> = {};
      for (const u of users) {
        if (u?.id && u?.email) map[u.id] = u.email;
      }
      setOwnerEmails(map);
    } catch (_e) {
      // non-fatal — Unblock button will be disabled when email missing
    }

    // Load latest activity per organisation
    loadLatestActivity();
  };

  const loadLatestActivity = async () => {
    const { data } = await supabase
      .from("tenant_activity_log" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as any[]) || [];
    const map: Record<string, ActivityEntry> = {};
    for (const r of rows) {
      const orgId = r.organisation_id as string | null;
      if (orgId && !map[orgId]) map[orgId] = r as ActivityEntry;
    }
    setLatestActivity(map);
  };

  const logTenantActivity = async (
    organisationId: string,
    eventType: "magic_link_sent" | "access_blocked" | "access_unblocked",
    note: string | null,
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tenant_activity_log" as any).insert({
        organisation_id: organisationId,
        event_type: eventType,
        performed_by: user?.id ?? null,
        note,
      } as any);
      if (error) {
        console.error("Failed to log tenant activity:", error.message);
      }
    } catch (e) {
      console.error("Failed to log tenant activity:", e);
    }
    loadLatestActivity();
  };

  const handleUnblockTenant = async (tenant: Tenant) => {
    setTogglingBlockFor(tenant.id);
    try {
      const { error } = await supabase
        .from("organisations")
        .update({ is_blocked: false } as any)
        .eq("id", tenant.id);
      if (error) throw error;

      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, is_blocked: false } : t)),
      );

      await logTenantActivity(tenant.id, "access_unblocked", tenant.name);
      toast.success(`${tenant.name} unblocked`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tenant");
    } finally {
      setTogglingBlockFor(null);
    }
  };

  const openBlockModal = (tenant: Tenant) => {
    setBlockModalTenant(tenant);
    setBlockReason("");
  };

  const handleConfirmBlock = async () => {
    if (!blockModalTenant) return;
    const reason = blockReason.trim();
    if (reason.length < 10) {
      toast.error("Reason must be at least 10 characters");
      return;
    }
    const tenant = blockModalTenant;
    setConfirmingBlock(true);
    try {
      const { error } = await supabase
        .from("organisations")
        .update({ is_blocked: true } as any)
        .eq("id", tenant.id);
      if (error) throw error;

      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, is_blocked: true } : t)),
      );

      await logTenantActivity(tenant.id, "access_blocked", reason);

      const ownerEmail = tenant.owner_user_id ? ownerEmails[tenant.owner_user_id] : null;
      if (ownerEmail) {
        try {
          const { data, error: fnErr } = await supabase.functions.invoke(
            "send-block-notification",
            { body: { email: ownerEmail, org_name: tenant.name, reason } },
          );
          if (fnErr || (data as any)?.error) {
            const msg = (data as any)?.error || fnErr?.message || "Failed to send notification";
            toast.error(`Blocked, but email failed: ${msg}`);
          } else {
            toast.success(`${tenant.name} blocked — owner notified`);
          }
        } catch (e) {
          toast.error(`Blocked, but email failed: ${e instanceof Error ? e.message : "unknown"}`);
        }
      } else {
        toast.success(`${tenant.name} blocked (no owner email on file)`);
      }

      setBlockModalTenant(null);
      setBlockReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to block tenant");
    } finally {
      setConfirmingBlock(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveModalTenant) return;
    if (archiveTypedName.trim() !== archiveModalTenant.name) return;
    const tenant = archiveModalTenant;
    setArchiving(true);
    try {
      const { error } = await supabase
        .from("organisations")
        .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
        .eq("id", tenant.id);
      if (error) throw error;
      toast.success("Organisation archived");
      setArchiveModalTenant(null);
      setArchiveTypedName("");
      loadTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setArchiving(false);
    }
  };

  const openActivityModal = async (tenant: Tenant) => {
    setActivityModalOrg(tenant);
    setLoadingActivityModal(true);
    setActivityModalEntries([]);
    try {
      const { data, error } = await supabase
        .from("tenant_activity_log" as any)
        .select("*")
        .eq("organisation_id", tenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setActivityModalEntries((data as any[]) as ActivityEntry[] || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoadingActivityModal(false);
    }
  };

  const handleUnblock = async (email: string, orgId: string) => {
    setUnblockingEmail(email);
    try {
      const { data, error } = await supabase.functions.invoke("reset-auth-block", {
        body: { email },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed to unblock");
      }
      toast.success("User unblocked successfully");

      // Re-fetch blocked status for this org
      setBlockedStatus((prev) => ({
        ...prev,
        [orgId]: { loading: true, hasBlocked: prev[orgId]?.hasBlocked ?? false },
      }));
      try {
        const { data: lu, error: luErr } = await supabase.functions.invoke("list-users", {
          body: { org_id: orgId },
        });
        const users = ((lu as any)?.users as any[]) || [];
        const hasBlocked =
          !luErr && !(lu as any)?.error && users.some((u) => !!u?.blocked);
        setBlockedStatus((prev) => ({ ...prev, [orgId]: { loading: false, hasBlocked } }));
      } catch {
        setBlockedStatus((prev) => ({
          ...prev,
          [orgId]: { loading: false, hasBlocked: prev[orgId]?.hasBlocked ?? false },
        }));
      }

      // Close the popover for this org
      setCloseSignals((prev) => ({ ...prev, [orgId]: (prev[orgId] ?? 0) + 1 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unblock user");
    } finally {
      setUnblockingEmail(null);
    }
  };


  const handleSendMagicLink = async (tenantId: string, email: string, orgName: string) => {
    setSendingMagicLinkFor(tenantId);
    try {
      const { data, error } = await supabase.functions.invoke("send-magic-link", {
        body: { email, org_name: orgName },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed");
      }
      toast.success(`Magic link sent to ${email}`);
      await logTenantActivity(tenantId, "magic_link_sent", email);
    } catch (_e) {
      toast.error("Failed to send magic link");
    } finally {
      setSendingMagicLinkFor(null);
    }
  };

  useEffect(() => {
    if (authChecked) loadTenants();
  }, [authChecked]);

  // Auto-slug from company name unless user has edited it
  useEffect(() => {
    if (!slugDirty) setOrgSlug(slugify(companyName));
  }, [companyName, slugDirty]);

  // Auto-suggest job_reference_prefix from company name unless user has edited it
  useEffect(() => {
    if (!prefixDirty) {
      const suggested = companyName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
      setJobReferencePrefix(suggested);
    }
  }, [companyName, prefixDirty]);

  const PREFIX_RE = /^[A-Z0-9]{2,6}$/;
  const prefixValid = PREFIX_RE.test(jobReferencePrefix);

  const resetForm = () => {
    setCompanyName("");
    setCompanyPhone("");
    setOwnerName("");
    setOwnerEmail("");
    setOrgSlug("");
    setSlugDirty(false);
    setJobReferencePrefix("");
    setPrefixDirty(false);
    setErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setErrorMsg(null);

    const next: Record<string, string> = {};
    if (!companyName.trim()) next.company_name = "Required";
    if (!companyPhone.trim()) next.company_phone = "Required";
    if (!ownerName.trim()) next.owner_name = "Required";
    if (!ownerEmail.trim()) next.owner_email = "Required";
    if (!orgSlug.trim()) next.org_slug = "Required";
    if (!jobReferencePrefix.trim()) {
      next.job_reference_prefix = "Required";
    } else if (!PREFIX_RE.test(jobReferencePrefix)) {
      next.job_reference_prefix = "2–6 characters, uppercase letters or digits only";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-tenant`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${accessToken}`,
          "x-admin-secret": "bj-admin-2026-xK9mP3",
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          company_phone: companyPhone.trim(),
          owner_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          org_slug: orgSlug.trim(),
          job_reference_prefix: jobReferencePrefix.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json?.error === "slug_taken") {
          setErrorMsg("Slug already exists — choose a different one");
        } else {
          setErrorMsg(json?.detail || json?.error || `Request failed (${res.status})`);
        }
        return;
      }
      setSuccess(
        `✅ ${companyName} provisioned. Invite sent to ${ownerEmail}. Org ID: ${json.organisation_id}`
      );
      resetForm();
      loadTenants();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <Tabs value={tabValue} onValueChange={setTabValue} className="space-y-6">
        <TabsList>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="integrations">Customer Integrations</TabsTrigger>
          <TabsTrigger value="unblock-users">Unblock Users</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_phone">Company Phone</Label>
              <Input
                id="company_phone"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="087 XXXXXXX"
              />
              {errors.company_phone && (
                <p className="text-sm text-destructive">{errors.company_phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner_name">Owner Full Name</Label>
              <Input
                id="owner_name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
              {errors.owner_name && (
                <p className="text-sm text-destructive">{errors.owner_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner_email">Owner Email</Label>
              <Input
                id="owner_email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
              />
              {errors.owner_email && (
                <p className="text-sm text-destructive">{errors.owner_email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org_slug">Org Slug</Label>
              <Input
                id="org_slug"
                value={orgSlug}
                onChange={(e) => {
                  setSlugDirty(true);
                  setOrgSlug(e.target.value);
                }}
              />
              {errors.org_slug && (
                <p className="text-sm text-destructive">{errors.org_slug}</p>
              )}
            </div>

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {success}
              </div>
            )}
            {errorMsg && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {errorMsg}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTenants ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenants yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner Name</TableHead>
                    <TableHead>Owner Phone</TableHead>
                    <TableHead>Owner Email</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Magic Link</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => {
                    const email = t.owner_user_id ? ownerEmails[t.owner_user_id] : null;
                    const blocked = !!t.is_blocked;
                    const archived = !!t.is_archived;
                    const latest = latestActivity[t.id];
                    return (
                    <TableRow key={t.id} className={archived ? "opacity-50 bg-muted/40" : blocked ? "opacity-60 bg-muted/40" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/tenants/${t.id}`)}
                            className="text-primary hover:underline text-left"
                          >
                            {t.name}
                          </button>
                          {blocked && !archived && (
                            <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-100">
                              Blocked
                            </Badge>
                          )}
                          {t.subscription_status === "suspended" && !archived && (
                            <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-100">
                              Suspended
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{t.slug}</TableCell>
                      <TableCell>
                        {archived ? (
                          <Badge variant="secondary" className="bg-gray-200 text-gray-700 hover:bg-gray-200">
                            Archived
                          </Badge>
                        ) : (
                          <StatusBadge status={t.subscription_status} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{t.owner_name || "—"}</div>
                        {latest && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {EVENT_LABELS[latest.event_type] || latest.event_type} · {formatActivityTime(latest.created_at)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{t.owner_phone || "—"}</TableCell>
                      <TableCell>{email || "—"}</TableCell>
                      <TableCell>{t.industry || "—"}</TableCell>
                      <TableCell>
                        {new Date(t.created_at).toLocaleDateString('en-IE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!email || sendingMagicLinkFor === t.id}
                            onClick={() => email && handleSendMagicLink(t.id, email, t.name)}
                            title={email || "Owner email unavailable"}
                          >
                            {sendingMagicLinkFor === t.id ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Sending…
                              </>
                            ) : (
                              "Send Magic Link"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant={blocked ? "outline" : "destructive"}
                            disabled={togglingBlockFor === t.id}
                            onClick={() => (blocked ? handleUnblockTenant(t) : openBlockModal(t))}
                          >
                            {togglingBlockFor === t.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : blocked ? (
                              <>
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                Unblock
                              </>
                            ) : (
                              <>
                                <Ban className="mr-1 h-3 w-3" />
                                Block
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openActivityModal(t)}
                            title="View activity"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/tenants/${t.id}`)}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              const { error: cfgErr } = await supabase.rpc('set_config' as any, {
                                key: 'app.current_org_id',
                                value: t.id,
                                is_local: false,
                              } as any);
                              if (cfgErr) console.error('set_config (switch) failed:', cfgErr);
                              setViewingOrg(t.id, t.name);
                              toast.success(`Switched to ${t.name}`);
                              navigate("/dashboard");
                            }}
                          >
                            Switch Context
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <CustomerIntegrationsTab />
        </TabsContent>

        <TabsContent value="unblock-users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Unblock Users</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTenants ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : tenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenants yet</p>
              ) : (
                <div className="divide-y">
                  {tenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                      </div>
                      <UnblockUserPopover
                        orgId={t.id}
                        ownerEmails={ownerEmails}
                        unblockingEmail={unblockingEmail}
                        hasBlockedUsers={blockedStatus[t.id]?.hasBlocked ?? false}
                        checkingBlocked={blockedStatus[t.id]?.loading ?? false}
                        onUnblock={async (email) => {
                          await handleUnblock(email, t.id);
                        }}
                        closeSignal={closeSignals[t.id] ?? 0}
                      />

                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!activityModalOrg} onOpenChange={(open) => !open && setActivityModalOrg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Activity — {activityModalOrg?.name}
            </DialogTitle>
          </DialogHeader>
          {loadingActivityModal ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : activityModalEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
              {activityModalEntries.map((entry) => (
                <li key={entry.id} className="border-b pb-2 last:border-b-0">
                  <div className="text-sm font-medium">
                    {EVENT_LABELS[entry.event_type] || entry.event_type}
                  </div>
                  {entry.note && (
                    <div className="text-sm text-muted-foreground">{entry.note}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatActivityTime(entry.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!blockModalTenant}
        onOpenChange={(open) => {
          if (!open && !confirmingBlock) {
            setBlockModalTenant(null);
            setBlockReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Block {blockModalTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason for blocking</Label>
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Explain why this tenant is being blocked (min 10 characters)…"
              rows={4}
              disabled={confirmingBlock}
            />
            <p className="text-xs text-muted-foreground">
              {blockReason.trim().length}/10 characters minimum. The owner will be emailed
              with this reason.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBlockModalTenant(null);
                setBlockReason("");
              }}
              disabled={confirmingBlock}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmBlock}
              disabled={confirmingBlock || blockReason.trim().length < 10}
            >
              {confirmingBlock ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Blocking…
                </>
              ) : (
                "Confirm Block"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!archiveModalTenant}
        onOpenChange={(open) => {
          if (!open && !archiving) {
            setArchiveModalTenant(null);
            setArchiveTypedName("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Archive {archiveModalTenant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archive-name">
              Type the organisation name to confirm archiving
            </Label>
            <Input
              id="archive-name"
              value={archiveTypedName}
              onChange={(e) => setArchiveTypedName(e.target.value)}
              placeholder={archiveModalTenant?.name}
              disabled={archiving}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveModalTenant(null);
                setArchiveTypedName("");
              }}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmArchive}
              disabled={
                archiving ||
                archiveTypedName.trim() !== (archiveModalTenant?.name ?? "")
              }
            >
              {archiving ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Archiving…
                </>
              ) : (
                "Archive Organisation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

