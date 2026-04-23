import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const KN_ORG_ID = "8c37827f-ce2c-4507-a821-a5e807d89856";

type EngineerRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  organisation_id: string | null;
  auth_user_id: string | null;
  user_id: string | null;
  status: string;
};

type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
};

const Row = ({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean | null }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-b-0">
    <div className="text-xs text-muted-foreground font-medium pt-0.5">{label}</div>
    <div className="text-xs font-mono text-right break-all flex items-center gap-1.5">
      {ok === true && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
      {ok === false && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
      <span>{value ?? <span className="text-muted-foreground italic">null</span>}</span>
    </div>
  </div>
);

const IncomingJobsDebug = () => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [engineer, setEngineer] = useState<EngineerRow | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tallyCount, setTallyCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const [engRes, profRes, tallyRes, pendingRes] = await Promise.all([
          supabase
            .from("engineers")
            .select("id, name, email, role, organisation_id, auth_user_id, user_id, status")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("id, user_id, display_name")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("service_calls")
            .select("id", { count: "exact", head: true })
            .eq("source", "Tally Form"),
          supabase
            .from("service_calls")
            .select("id", { count: "exact", head: true })
            .eq("source", "Tally Form")
            .eq("incoming_status", "Pending"),
        ]);

        if (engRes.error) setErrorMsg(`engineers: ${engRes.error.message}`);
        else setEngineer(engRes.data as EngineerRow | null);
        if (profRes.data) setProfile(profRes.data as ProfileRow);
        setTallyCount(tallyRes.count ?? 0);
        setPendingCount(pendingRes.count ?? 0);
      } catch (e: any) {
        setErrorMsg(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm">Loading debug info...</div>;
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-sm">Not signed in.</div>;
  }

  const hasEngineerRow = !!engineer;
  const orgMatchesKN = engineer?.organisation_id === KN_ORG_ID;
  const shouldPassRLS = hasEngineerRow && orgMatchesKN;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Incoming Jobs — RLS Debug</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Confirms whether your account should be allowed to see Incoming Jobs via RLS.
        </p>
      </div>

      {/* Verdict */}
      <Card className={shouldPassRLS ? "border-success" : "border-destructive"}>
        <CardContent className="p-4 flex items-center gap-3">
          {shouldPassRLS ? (
            <>
              <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
              <div>
                <div className="font-bold text-sm">Should pass RLS ✅</div>
                <div className="text-xs text-muted-foreground">
                  You have an engineers row mapped to KN org. You should see Tally jobs.
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
              <div>
                <div className="font-bold text-sm">RLS will block you ❌</div>
                <div className="text-xs text-muted-foreground">
                  {!hasEngineerRow
                    ? "No engineers row found for your auth UID — get_user_organisation_id() returns NULL."
                    : `Your engineers.organisation_id (${engineer?.organisation_id}) does not match KN (${KN_ORG_ID}).`}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {errorMsg && (
        <Card className="border-destructive">
          <CardContent className="p-3 text-xs text-destructive font-mono">{errorMsg}</CardContent>
        </Card>
      )}

      {/* Auth */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Auth</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="auth.uid()" value={user.id} />
          <Row label="email" value={user.email ?? "—"} />
          <Row
            label="profiles row"
            value={profile ? profile.display_name || profile.id : "missing"}
            ok={!!profile}
          />
        </CardContent>
      </Card>

      {/* Engineers row */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            engineers row (drives RLS)
            {hasEngineerRow ? (
              <Badge variant="outline" className="text-success border-success">found</Badge>
            ) : (
              <Badge variant="destructive">missing</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {hasEngineerRow ? (
            <>
              <Row label="engineers.id" value={engineer!.id} />
              <Row label="name" value={engineer!.name} />
              <Row label="role" value={engineer!.role} />
              <Row label="status" value={engineer!.status} />
              <Row label="auth_user_id" value={engineer!.auth_user_id} ok={engineer!.auth_user_id === user.id} />
              <Row
                label="organisation_id"
                value={engineer!.organisation_id}
                ok={engineer!.organisation_id === KN_ORG_ID}
              />
              <Row label="(KN org expected)" value={KN_ORG_ID} />
            </>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              No row in <code>engineers</code> where <code>auth_user_id = {user.id}</code>.
              Ask an admin to add you in Settings → Team Management, or insert one mapped to the KN org.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visible counts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">What you can read right now</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="service_calls (source=Tally Form)"
            value={tallyCount}
            ok={(tallyCount ?? 0) > 0}
          />
          <Row
            label="… of which incoming_status=Pending"
            value={pendingCount}
            ok={(pendingCount ?? 0) > 0}
          />
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            These counts are run with your session and reflect what RLS lets you SELECT. If both are 0
            but the verdict above is green, the issue is data (no Tally jobs in DB) rather than RLS.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default IncomingJobsDebug;
