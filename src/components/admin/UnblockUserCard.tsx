import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";

type SearchResult = {
  found: boolean;
  email?: string;
  authUser?: {
    id: string;
    email: string | null;
    banned_until: string | null;
    last_sign_in_at: string | null;
  } | null;
  profile?: {
    id: string;
    user_id: string;
    display_name: string | null;
    role: string | null;
    organisation_id: string | null;
    organisation_name: string | null;
  } | null;
  engineers?: Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    organisation_id: string | null;
    organisation_name: string | null;
    auth_user_id: string | null;
  }>;
  loginAttempt?: {
    id: string;
    email: string;
    attempts: number;
    locked_at: string | null;
    last_attempt_at: string | null;
  } | null;
  status?: {
    isBlocked: boolean;
    isAuthBanned: boolean;
    isEngineerBlocked: boolean;
    isLoginLocked: boolean;
  };
};

export default function UnblockUserCard() {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [unblocking, setUnblocking] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setSearching(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("superadmin-unblock-user", {
        body: { action: "search", email: clean },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Search failed");
      }
      setResult(data as SearchResult);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const runUnblock = async () => {
    if (!result?.email) return;
    setUnblocking(true);
    try {
      const { data, error } = await supabase.functions.invoke("superadmin-unblock-user", {
        body: { action: "unblock", email: result.email },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Unblock failed");
      }
      const performed = ((data as any)?.performed as string[] | undefined) ?? [];
      toast.success(
        performed.length
          ? `Unblocked ${result.email} — ${performed.join(", ")}`
          : `${result.email} already active`,
      );
      setConfirmOpen(false);
      // refresh state
      await runSearch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unblock failed");
    } finally {
      setUnblocking(false);
    }
  };

  const org =
    result?.profile?.organisation_name ||
    result?.engineers?.[0]?.organisation_name ||
    "—";
  const name =
    result?.profile?.display_name ||
    result?.engineers?.[0]?.name ||
    "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Unblock User
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="unblock-email">Email</Label>
            <Input
              id="unblock-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={searching || !email.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </form>

        {result && !result.found && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No account found for this email.
          </div>
        )}

        {result?.found && (
          <div className="space-y-3 rounded-md border p-4 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Email:</span> {result.email}</div>
              <div><span className="text-muted-foreground">Name:</span> {name}</div>
              <div><span className="text-muted-foreground">Organisation:</span> {org}</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                {result.status?.isBlocked ? (
                  <Badge variant="destructive">Blocked</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100" variant="secondary">Active</Badge>
                )}
              </div>
            </div>

            {result.status?.isBlocked && (
              <ul className="ml-4 list-disc text-xs text-muted-foreground">
                {result.status.isLoginLocked && <li>Login attempts locked</li>}
                {result.status.isAuthBanned && (
                  <li>Auth banned until {new Date(result.authUser!.banned_until!).toLocaleString("en-IE")}</li>
                )}
                {result.status.isEngineerBlocked && <li>Engineer record status = blocked</li>}
              </ul>
            )}

            {result.status?.isBlocked && (
              <div>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={unblocking}
                >
                  {unblocking && <Loader2 className="h-4 w-4 animate-spin" />}
                  Unblock
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock {result?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be able to log in again immediately. This clears any login lockout, engineer block, and auth ban.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unblocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runUnblock(); }} disabled={unblocking}>
              {unblocking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unblock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
