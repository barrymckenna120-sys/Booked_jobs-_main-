import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Plus,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Building2,
  Wrench,
  Ban,
  Trash2,
  UserCheck,
  Mail,
  Link,
  KeyRound,
  Pencil,
} from "lucide-react";

// ── Role config ────────────────────────────────────────────────────
const ROLES: Record<string, { label: string; icon: React.ReactNode; description: string; perms: string[] }> = {
  owner: {
    label: "Owner / Manager",
    icon: <ShieldCheck className="w-4 h-4" />,
    description: "Owner-level access — full control across office and engineer apps",
    perms: ["All admin permissions", "Switch between office & engineer view", "Invite & block users", "Access settings", "View finance & reports"],
  },
  admin: {
    label: "Admin",
    icon: <ShieldCheck className="w-4 h-4" />,
    description: "Full access — invite users, manage settings, see all data",
    perms: ["All engineer permissions", "Invite & block users", "Access settings", "View finance & reports", "Manage all jobs"],
  },
  office: {
    label: "Office",
    icon: <Building2 className="w-4 h-4" />,
    description: "Office control — schedule, customers, quotes, payments",
    perms: ["View & manage all jobs", "Customer management", "Quotes & payments", "WhatsApp messaging", "View reports"],
  },
  engineer: {
    label: "Engineer",
    icon: <Wrench className="w-4 h-4" />,
    description: "Field only — sees assigned jobs, can start and complete",
    perms: ["View own assigned jobs only", "Start & complete jobs", "Call & navigate", "Log completion notes", "Upload photos"],
  },
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  office: "bg-blue-100 text-blue-700 border-blue-200",
  engineer: "bg-green-100 text-green-700 border-green-200",
};

interface AuthUser {
  id: string;
  email: string | null;
  banned_until: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  blocked_reason: string | null;
  is_available: boolean;
  created_at: string;
  auth_user_id: string | null;
  rgi_number: string | null;
}

const TeamManagement = () => {
  const { user, loading: authLoading } = useAuth();
  const { orgId, ready } = useOrgId();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", phone: "", role: "engineer" });
  const [saving, setSaving] = useState(false);

  // Block dialog
  const [blockTarget, setBlockTarget] = useState<TeamMember | null>(null);
  const [blockReason, setBlockReason] = useState("");

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", rgi_number: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Link login dialog
  const [linkTarget, setLinkTarget] = useState<TeamMember | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linking, setLinking] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!user) return;
    if (!ready) return;
    setLoading(true);

    if (!orgId) {
      setLoading(false);
      return; // can't scope queries without orgId
    }


    const { data: engs } = await supabase
      .from("engineers")
      .select("id, name, email, phone, role, status, blocked_reason, is_available, created_at, auth_user_id, rgi_number")
      .eq("organisation_id", orgId)
      .order("name");

    let combined: TeamMember[] = (engs as TeamMember[]) || [];

    if (orgId) {
      // Pull all profiles in this org and surface any that aren't already an engineer
      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("id, display_name, created_at")
        .eq("organisation_id", orgId);

      const existingAuthIds = new Set(
        combined.map((m) => m.auth_user_id).filter(Boolean) as string[]
      );
      const extras: TeamMember[] = ((profs as any[]) || [])
        .filter((p) => p.id && !existingAuthIds.has(p.id))
        .map((p) => ({
          id: `profile-${p.id}`,
          name: p.display_name || "Owner",
          email: null,
          phone: null,
          role: "admin",
          status: "active",
          blocked_reason: null,
          is_available: true,
          created_at: p.created_at,
          auth_user_id: p.id,
          rgi_number: null,
        }));
      combined = [...combined, ...extras];

      // Sort the org owner to the top
      const { data: org } = await (supabase as any)
        .from("organisations")
        .select("owner_user_id")
        .eq("id", orgId)
        .maybeSingle();
      const ownerId = (org as any)?.owner_user_id ?? null;
      combined.sort((a, b) => {
        if (ownerId) {
          if (a.auth_user_id === ownerId) return -1;
          if (b.auth_user_id === ownerId) return 1;
        }
        return (a.name || "").localeCompare(b.name || "");
      });
    }

    setMembers(combined);
    setLoading(false);
  }, [user, orgId, ready]);

  const fetchAuthUsers = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("list-users");
    if (error) {
      console.error("[TeamManagement] list-users error:", error);
      toast({
        title: "Couldn't load auth status",
        description: "Blocked user badges may not appear. Please refresh.",
        variant: "destructive",
      });
    } else if (data?.users) {
      setAuthUsers(data.users);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchMembers();
      fetchAuthUsers();
    }
  }, [user, fetchMembers, fetchAuthUsers]);

  // ── Actions ──────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!user || !inviteForm.name.trim()) return;
    if (!orgId) {
      toast({ title: "Organisation not ready", description: "Please try again in a moment.", variant: "destructive" });
      return;
    }
    setSaving(true);


    // 1. Create the engineer record
    const { data: newEng, error } = await supabase.from("engineers").insert({
      name: inviteForm.name.trim(),
      email: inviteForm.email.trim() || null,
      phone: inviteForm.phone.trim() || null,
      role: inviteForm.role,
      status: "active",
      user_id: null,
      organisation_id: orgId,
    } as any).select("id").single();

    if (error) {
      setSaving(false);
      toast({ title: "Error adding member", description: error.message, variant: "destructive" });
      return;
    }

    // 2. If email provided, send invite via edge function
    const email = inviteForm.email.trim();
    if (email && newEng) {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("invite-team-member", {
        body: { engineer_id: newEng.id, email, name: inviteForm.name.trim(), role: inviteForm.role, organisation_id: orgId },
      });
      if (fnError || fnData?.error) {
        toast({
          title: `${inviteForm.name} added but invite email failed`,
          description: fnData?.error || fnError?.message || "Could not send invite",
          variant: "destructive",
        });
      } else {
        toast({ title: `${inviteForm.name} added — invite email sent to ${email}` });
      }

      // Send branded welcome email via Resend
      supabase.functions.invoke("send-email", {
        body: {
          type: "welcome",
          data: {
            name: inviteForm.name.trim(),
            email,
            role: inviteForm.role,
            loginUrl: `${window.location.origin}/auth`,
          },
        },
      }).catch(() => {}); // fire-and-forget
    } else {
      toast({ title: `${inviteForm.name} added as ${ROLES[inviteForm.role]?.label}` });
    }

    setSaving(false);
    setInviteForm({ name: "", email: "", phone: "", role: "engineer" });
    setInviteOpen(false);
    logAudit({
      action_type: "user_invited",
      entity_type: "user",
      entity_id: newEng?.id || "",
      detail: `Invited: ${inviteForm.name.trim()} as ${ROLES[inviteForm.role]?.label}`,
      metadata: { role: inviteForm.role, email: inviteForm.email.trim() },
    });
    fetchMembers();
    setInviteOpen(false);
    fetchMembers();
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    const m = members.find((m) => m.id === id);
    const canAccessOffice = ["admin", "owner"].includes(newRole);
    await supabase.from("engineers").update({ role: newRole, can_access_office: canAccessOffice } as any).eq("id", id);
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role: newRole, can_access_office: canAccessOffice } : m)));
    toast({ title: `${m?.name} is now ${ROLES[newRole]?.label}` });
    logAudit({
      action_type: "user_role_changed",
      entity_type: "user",
      entity_id: id,
      detail: `Role changed: ${m?.name} — ${ROLES[m?.role || ""]?.label} → ${ROLES[newRole]?.label}`,
      metadata: { from: m?.role, to: newRole },
    });
  };

  const handleBlock = async () => {
    if (!blockTarget || !blockReason) return;
    await supabase
      .from("engineers")
      .update({ status: "blocked", blocked_reason: blockReason, is_available: false } as any)
      .eq("id", blockTarget.id);
    setMembers((prev) =>
      prev.map((m) => (m.id === blockTarget.id ? { ...m, status: "blocked", blocked_reason: blockReason, is_available: false } : m))
    );
    toast({ title: `${blockTarget.name} has been blocked` });
    logAudit({
      action_type: "user_blocked",
      entity_type: "user",
      entity_id: blockTarget.id,
      detail: `Blocked: ${blockTarget.name} — ${blockReason}`,
      metadata: { reason: blockReason },
    });
    setBlockTarget(null);
    setBlockReason("");
  };

  const handleUnblock = async (id: string) => {
    const member = members.find((m) => m.id === id);
    const wasDeactivated = member?.status === "deactivated";

    // Clear auth ban AND reset engineers.status server-side.
    // engineers.status writes are restricted to admin/owner by RLS, so this
    // must run via the edge function (service-role) so office/manager callers
    // don't silently fail with a 409/permission error.
    const { error } = await supabase.functions.invoke("unblock-user", {
      body: {
        userId: member?.auth_user_id ?? undefined,
        engineerId: id,
      },
    });
    if (error) {
      console.error("[TeamManagement] unblock-user error:", error);
      toast({
        title: wasDeactivated ? "Failed to reactivate user" : "Failed to unblock user",
        variant: "destructive",
      });
      return;
    }

    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "active", blocked_reason: null, is_available: true } : m))
    );
    toast({
      title: wasDeactivated
        ? `${member?.name} has been reactivated`
        : `${member?.name} has been unblocked`,
    });
    logAudit({
      action_type: wasDeactivated ? "user_reactivated" : "user_unblocked",
      entity_type: "user",
      entity_id: id,
      detail: `${wasDeactivated ? "Reactivated" : "Unblocked"}: ${member?.name}`,
    });
    // Refresh auth users list
    fetchAuthUsers();
  };


  const handleDelete = async () => {
    if (!deleteTarget) return;

    // Soft-delete via edge function: bans auth login, marks profile inactive,
    // and sets engineers.status='deactivated'. Reversible via Reactivate.
    const { data, error } = await supabase.functions.invoke("deactivate-user", {
      body: { engineerId: deleteTarget.id },
    });

    if (error || data?.error) {
      if (data?.error === "active_jobs") {
        const count = data.count ?? 0;
        toast({
          title: `Cannot deactivate ${deleteTarget.name} — they have ${count} active job${count === 1 ? "" : "s"} assigned. Reassign or complete these jobs first.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to deactivate user",
          description: data?.error || error?.message,
          variant: "destructive",
        });
      }
      setDeleteTarget(null);
      return;
    }

    setMembers((prev) =>
      prev.map((m) =>
        m.id === deleteTarget.id
          ? { ...m, status: "deactivated", is_available: false, blocked_reason: "Deactivated" }
          : m,
      ),
    );
    toast({ title: `${deleteTarget.name} has been deactivated` });
    logAudit({
      action_type: "user_deactivated",
      entity_type: "user",
      entity_id: deleteTarget.id,
      detail: `Deactivated: ${deleteTarget.name}`,
      metadata: { auth_user_id: deleteTarget.auth_user_id },
    });
    setDeleteTarget(null);
    fetchAuthUsers();
  };

  const handleSendInvite = async (member: TeamMember) => {
    if (!member.email) {
      toast({ title: "No email address", description: "Add an email before sending an invite.", variant: "destructive" });
      return;
    }
    toast({ title: "Sending invite…" });
    const { data, error } = await supabase.functions.invoke("invite-team-member", {
      body: { engineer_id: member.id, email: member.email, name: member.name, role: member.role },
    });
    if (error || data?.error) {
      toast({ title: "Invite failed", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: `Invite sent to ${member.email}` });
      fetchMembers();
    }
  };

  const handleResetPassword = async (member: TeamMember) => {
    if (!member.email) {
      toast({ title: "No email address", description: "This member has no email to send a reset to.", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.functions.invoke("send-reset-email", {
        body: { email: member.email },
      });
      if (error) throw error;
      toast({ title: `Password reset email sent to ${member.email}` });
      logAudit({
        action_type: "password_reset_requested",
        entity_type: "user",
        entity_id: member.id,
        detail: `Password reset requested for ${member.name} (${member.email})`,
        metadata: { target_email: member.email, triggered_by: "admin" },
      });
    } catch (err: any) {
      toast({ title: "Failed to send reset email", description: err.message, variant: "destructive" });
    }
  };

  const openEditDialog = (member: TeamMember) => {
    setEditForm({
      name: member.name,
      email: member.email || "",
      phone: member.phone || "",
      rgi_number: (member as any).rgi_number || "",
    });
    setEditTarget(member);
  };

  const handleEditSave = async () => {
    if (!editTarget || !editForm.name.trim()) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("engineers")
      .update({
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        rgi_number: editForm.rgi_number.trim() || null,
      } as any)
      .eq("id", editTarget.id);
    setEditSaving(false);
    if (error) {
      toast({ title: "Error updating engineer", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Engineer updated successfully" });
    setEditTarget(null);
    fetchMembers();
  };

  const handleLinkLogin = async () => {
    if (!linkTarget || !linkEmail.trim()) return;
    const emailVal = linkEmail.trim().toLowerCase();
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setLinking(true);
    const { data, error } = await supabase.functions.invoke("invite-team-member", {
      body: { engineer_id: linkTarget.id, email: emailVal, name: linkTarget.name, role: linkTarget.role },
    });
    setLinking(false);
    if (error || data?.error) {
      toast({ title: "Link failed", description: data?.error || error?.message, variant: "destructive" });
    } else {
      const msg = data?.existing
        ? `${linkTarget.name} linked to existing account (${emailVal})`
        : `${linkTarget.name} linked — invite sent to ${emailVal}`;
      toast({ title: msg });
      logAudit({
        action_type: "user_invited",
        entity_type: "user",
        entity_id: linkTarget.id,
        detail: `Login linked: ${linkTarget.name} → ${emailVal}`,
        metadata: { email: emailVal, existing_account: !!data?.existing },
      });
      setLinkTarget(null);
      setLinkEmail("");
      fetchMembers();
    }
  };

  // ── Auth lockout helper ──────────────────────────────────────────
  const isAuthLocked = (member: TeamMember): boolean => {
    if (!member.auth_user_id) return false;
    const authUser = authUsers.find((u) => u.id === member.auth_user_id);
    if (!authUser?.banned_until) return false;
    return new Date(authUser.banned_until) > new Date();
  };

  const isEffectivelyBlocked = (m: TeamMember) => m.status === "blocked" || isAuthLocked(m);

  // ── Filter / search ─────────────────────────────────────────────
  const filtered = members.filter((m) => {
    const blocked = isEffectivelyBlocked(m);
    const matchFilter =
      filter === "all" ||
      (filter === "blocked" ? blocked : m.role === filter && !blocked);
    const matchSearch =
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.email || "").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: members.length,
    admin: members.filter((m) => m.role === "admin" && !isEffectivelyBlocked(m)).length,
    office: members.filter((m) => m.role === "office" && !isEffectivelyBlocked(m)).length,
    engineer: members.filter((m) => m.role === "engineer" && !isEffectivelyBlocked(m)).length,
    blocked: members.filter((m) => isEffectivelyBlocked(m)).length,
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const BLOCK_REASONS = ["Resigned", "No longer employed", "Security concern", "Account misuse", "Other"];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Team & Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage who has access · {members.filter((m) => m.status === "active").length} active
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Member
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { key: "admin", label: "Admins", color: "text-purple-600" },
          { key: "office", label: "Office", color: "text-blue-600" },
          { key: "engineer", label: "Engineers", color: "text-green-600" },
          { key: "blocked", label: "Blocked", color: "text-destructive" },
        ] as const).map((c) => (
          <Card
            key={c.key}
            className={`cursor-pointer transition-all ${filter === c.key ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter(filter === c.key ? "all" : c.key)}
          >
            <CardContent className="py-4 px-5">
              <div className={`text-2xl font-black ${c.color}`}>{counts[c.key]}</div>
              <div className="text-xs font-medium text-muted-foreground mt-1">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filter pills */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: "all", label: "All" },
            { id: "admin", label: "Admins" },
            { id: "office", label: "Office" },
            { id: "engineer", label: "Engineers" },
            { id: "blocked", label: "Blocked" },
          ].map((f) => (
            <Button
              key={f.id}
              variant={filter === f.id ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.id)}
              className="gap-1.5"
            >
              {f.label}
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {counts[f.id as keyof typeof counts]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Members list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No members found.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {filtered.map((member) => {
              const role = ROLES[member.role] || ROLES.engineer;
              const authLockedOut = isAuthLocked(member);
              const isBlocked = member.status === "blocked" || authLockedOut;

              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 ${
                    isBlocked ? "bg-destructive/5" : ""
                  }`}
                >
                  {/* Avatar */}
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback
                      className={`text-sm font-bold ${
                        isBlocked ? "bg-destructive/10 text-destructive" : ROLE_COLORS[member.role]?.split(" ")[0] + " " + ROLE_COLORS[member.role]?.split(" ")[1]
                      }`}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold truncate ${
                          isBlocked ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {member.name}
                      </span>
                    </div>
                    {member.email && (
                      <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    )}
                    {!isBlocked && !member.auth_user_id && (
                      <div className="text-xs text-amber-600 font-medium mt-0.5">
                        ⚠ No login linked
                      </div>
                    )}
                    {!isBlocked && member.auth_user_id && (
                      <div className="text-xs text-green-600 font-medium mt-0.5">
                        ✓ Login linked
                      </div>
                    )}
                    {isBlocked && (member.blocked_reason || authLockedOut) && (
                      <div className="text-xs text-destructive font-medium mt-0.5">
                        🚫 {authLockedOut && member.status !== "blocked" ? "Locked out (failed login attempts)" : `Blocked: ${member.blocked_reason || "No reason"}`}
                      </div>
                    )}
                  </div>

                  {/* Role badge */}
                  {(() => {
                    const isDeactivated = member.status === "deactivated";
                    const pillLabel = isDeactivated ? "Deactivated" : isBlocked ? "Blocked" : role.label;
                    return (
                      <Badge
                        variant="outline"
                        className={`shrink-0 gap-1 ${isBlocked ? "bg-destructive/10 text-destructive border-destructive/20" : ROLE_COLORS[member.role] || ""}`}
                      >
                        {isBlocked ? <Ban className="w-3 h-3" /> : role.icon}
                        {pillLabel}
                      </Badge>
                    );
                  })()}

                  {/* Inline Reactivate / Unblock button */}
                  {isBlocked && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                      onClick={() => handleUnblock(member.id)}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {member.status === "deactivated" ? "Reactivate" : "Unblock"}
                    </Button>
                  )}

                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {!isBlocked && (
                        <DropdownMenuItem onClick={() => openEditDialog(member)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                      )}
                      {!isBlocked && (
                        <>
                          <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                          {Object.entries(ROLES)
                            .filter(([key]) => key !== member.role)
                            .map(([key, r]) => (
                              <DropdownMenuItem key={key} onClick={() => handleChangeRole(member.id, key)}>
                                {r.icon}
                                <span className="ml-2">Set as {r.label}</span>
                              </DropdownMenuItem>
                            ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {!isBlocked && !member.auth_user_id && member.email && (
                        <DropdownMenuItem onClick={() => handleSendInvite(member)}>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Login Invite
                        </DropdownMenuItem>
                      )}
                      {!isBlocked && !member.auth_user_id && (
                        <DropdownMenuItem onClick={() => { setLinkTarget(member); setLinkEmail(member.email || ""); }}>
                          <Link className="w-4 h-4 mr-2" />
                          Link Login
                        </DropdownMenuItem>
                      )}
                      {!isBlocked && member.auth_user_id && member.email && (
                        <DropdownMenuItem onClick={() => handleSendInvite(member)}>
                          <Mail className="w-4 h-4 mr-2" />
                          Resend Invite
                        </DropdownMenuItem>
                      )}
                      {!isBlocked && member.email && (
                        <DropdownMenuItem onClick={() => handleResetPassword(member)}>
                          <KeyRound className="w-4 h-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                      )}
                      {isBlocked ? (
                        <DropdownMenuItem onClick={() => handleUnblock(member.id)}>
                          <UserCheck className="w-4 h-4 mr-2 text-green-600" />
                          {member.status === "deactivated" ? "Reactivate" : "Unblock"}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setBlockTarget(member)}
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Block User
                        </DropdownMenuItem>
                      )}
                      {member.status !== "deactivated" && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(member)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Deactivate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Footer count */}
      <div className="text-xs text-muted-foreground text-center">
        {filtered.length} of {members.length} members shown
      </div>

      {/* ── Invite Dialog ────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Role selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Role</Label>
              <div className="space-y-2">
                {Object.entries(ROLES).map(([key, r]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInviteForm((f) => ({ ...f, role: key }))}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                      inviteForm.role === key
                        ? `${ROLE_COLORS[key]} border-current`
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <div className="shrink-0">{r.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{r.label}</div>
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    </div>
                    {inviteForm.role === key && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions preview */}
            <div className={`rounded-lg p-3 ${ROLE_COLORS[inviteForm.role]} border`}>
              <div className="text-xs font-bold uppercase mb-2">
                {ROLES[inviteForm.role]?.label} Permissions
              </div>
              <div className="space-y-1">
                {ROLES[inviteForm.role]?.perms.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span>✓</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Full Name *</Label>
              <Input
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Brian Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="brian@example.ie"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phone</Label>
              <Input
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+353 87 123 4567"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={!inviteForm.name.trim() || saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Add as {ROLES[inviteForm.role]?.label}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Block Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!blockTarget} onOpenChange={(o) => !o && setBlockTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Block {blockTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            They will be marked as blocked and set unavailable. Select a reason:
          </p>
          <div className="space-y-2 py-2">
            {BLOCK_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setBlockReason(r)}
                className={`w-full text-left p-2.5 rounded-lg border text-sm transition-all ${
                  blockReason === r
                    ? "border-destructive bg-destructive/10 text-destructive font-semibold"
                    : "border-border hover:bg-muted"
                }`}
              >
                {r} {blockReason === r && "✓"}
              </button>
            ))}
          </div>
          {!blockReason && (
            <p className="text-xs text-destructive font-medium">Select a reason to continue</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBlockTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!blockReason}
              onClick={handleBlock}
            >
              Block User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access immediately and be removed from assign dropdowns.
              Their job history stays intact and you can reactivate them any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Link Login Dialog ────────────────────────────────────── */}
      <Dialog open={!!linkTarget} onOpenChange={(o) => { if (!o) { setLinkTarget(null); setLinkEmail(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Link Login for {linkTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter the email address for this team member. They'll receive an invite email to create their login.
          </p>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email Address *</Label>
              <Input
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="engineer@example.ie"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setLinkTarget(null); setLinkEmail(""); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={!linkEmail.trim() || linking}
                onClick={handleLinkLogin}
              >
                {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                Link & Invite
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Full Name *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.ie"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+353 87 123 4567"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">RGI Number</Label>
              <Input
                value={editForm.rgi_number}
                onChange={(e) => setEditForm((f) => ({ ...f, rgi_number: e.target.value }))}
                placeholder="e.g. 12345"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={!editForm.name.trim() || editSaving} className="gap-2">
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamManagement;
