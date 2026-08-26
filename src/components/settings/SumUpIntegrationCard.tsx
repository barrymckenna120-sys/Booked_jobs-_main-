import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, Save, Plug, Unplug, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  environmentMismatchWarning,
  normaliseEnvironment,
  validateSumUpForm,
  valuesForEnvironment,
  type SumUpEnvironment,
  type SumUpEnvironmentEntry,
  type SumUpFormErrors,
} from "@/lib/sumupIntegrationForm";

type Status = "loading" | "connected" | "not_connected" | "error";

interface SumUpState {
  merchant_code: string;
  api_key_secret: string;
  environment?: SumUpEnvironment;
  environments?: Partial<Record<SumUpEnvironment, SumUpEnvironmentEntry>>;
  secret_present: boolean;
  configured: boolean;
}

/**
 * Tenant-facing SumUp setup, driven entirely by the caller's own organisation
 * (resolved server-side in the `sumup-integration` function). Nothing here is
 * specific to any tenant, and the API key VALUE is never handled in the
 * frontend — the form takes the NAME of the backend secret holding it.
 */
const SumUpIntegrationCard = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [merchantCode, setMerchantCode] = useState("");
  const [secretName, setSecretName] = useState("");
  const [environment, setEnvironment] = useState<SumUpEnvironment>("test");
  const [environments, setEnvironments] =
    useState<Partial<Record<SumUpEnvironment, SumUpEnvironmentEntry>>>({});
  const [secretPresent, setSecretPresent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<SumUpFormErrors>({});
  // Environment flips are superadmin-only (enforced server-side too); everyone
  // else sees the current mode as a read-only badge.
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      setIsSuperadmin((profile as { role?: string } | null)?.role === "superadmin");
    })();
  }, []);

  const applyState = useCallback((s: SumUpState) => {
    const env = normaliseEnvironment(s.environment);
    setMerchantCode(s.merchant_code ?? "");
    setSecretName(s.api_key_secret ?? "");
    setEnvironment(env);
    setEnvironments(s.environments ?? {});
    setSecretPresent(!!s.secret_present);
    if (!s.merchant_code && !s.api_key_secret) {
      setStatus("not_connected");
      setStatusMessage("No SumUp account connected yet.");
    } else if (!s.configured) {
      setStatus("error");
      setStatusMessage(
        s.secret_present
          ? "Configuration incomplete."
          : `No backend secret named ${s.api_key_secret || "—"} was found.`,
      );
    } else {
      setStatus("connected");
      setStatusMessage("Credentials saved. Run Test Connection to confirm with SumUp.");
    }
  }, []);

  const call = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    const { data, error } = await invokeFunction<any>("sumup-integration", {
      body: { action, ...body },
    });
    if (error) {
      const details = (error as any)?.context?.text
        ? await (error as any).context.text()
        : error.message;
      throw new Error(details || "Request failed");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        applyState(await call("status"));
      } catch (e: any) {
        setStatus("error");
        setStatusMessage(e.message);
      }
    })();
  }, [call, applyState]);

  /** Switching environment loads that environment's own saved pair, never the other's. */
  const handleEnvironmentChange = (value: string) => {
    const next = normaliseEnvironment(value);
    setEnvironment(next);
    const saved = valuesForEnvironment(next, environments);
    setMerchantCode(saved.merchantCode);
    setSecretName(saved.secretName);
    setErrors({});
  };

  const mismatch = useMemo(
    () => environmentMismatchWarning(environment, secretName),
    [environment, secretName],
  );

  const handleSave = async () => {
    const found = validateSumUpForm({ merchantCode, secretName, environment });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const res = await call("save", {
        merchant_code: merchantCode.trim().toUpperCase(),
        api_key_secret: secretName.trim(),
        environment,
      });
      applyState(res);
      if (res.warning) {
        setStatus("error");
        setStatusMessage(res.warning);
        toast({ title: "Saved with a warning", description: res.warning });
      } else {
        toast({ title: "SumUp configuration saved" });
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await call("test");
      if (res.ok) {
        setStatus("connected");
        setStatusMessage(res.message);
        toast({ title: "Connection successful", description: res.message });
      } else {
        setStatus("error");
        setStatusMessage(res.message);
        toast({ title: "Connection failed", description: res.message, variant: "destructive" });
      }
    } catch (e: any) {
      setStatus("error");
      setStatusMessage(e.message);
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      applyState(await call("disconnect"));
      setErrors({});
      toast({ title: "SumUp disconnected" });
    } catch (e: any) {
      toast({ title: "Disconnect failed", description: e.message, variant: "destructive" });
    } finally {
      setDisconnecting(false);
      setConfirmOpen(false);
    }
  };

  const statusBadge = () => {
    if (status === "loading") {
      return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" />Checking</Badge>;
    }
    if (status === "connected") {
      return <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10"><CheckCircle2 className="w-3 h-3" />Connected</Badge>;
    }
    if (status === "error") {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Error</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><XCircle className="w-3 h-3" />Not Connected</Badge>;
  };

  const busy = saving || testing || disconnecting || status === "loading";
  const hasConfig = !!(merchantCode || secretName);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Plug className="w-4 h-4" />SumUp
            </CardTitle>
            <CardDescription>
              Take and track customer card payments through your own SumUp merchant account
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status !== "not_connected" && status !== "loading" && (
              <Badge variant="outline" className="uppercase text-[10px] tracking-wide">
                {environment}
              </Badge>
            )}
            {statusBadge()}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {statusMessage && (
          <p className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {statusMessage}
          </p>
        )}

        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={status === "loading"}>
            <ChevronDown className="w-4 h-4 mr-2" />
            {hasConfig ? "Edit SumUp setup" : "Set up SumUp"}
          </Button>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Provider</Label>
                <Input value="sumup" readOnly disabled className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground">Fixed provider key stored against your organisation.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Environment</Label>
                {isSuperadmin ? (
                  <Select value={environment} onValueChange={handleEnvironmentChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test (sandbox)</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted/40">
                    <Badge variant="outline" className="uppercase text-[10px] tracking-wide">
                      {environment === "live" ? "Live" : "Test (sandbox)"}
                    </Badge>
                  </div>
                )}
                {errors.environment
                  ? <p className="text-xs text-destructive">{errors.environment}</p>
                  : (
                    <p className="text-xs text-muted-foreground">
                      {isSuperadmin
                        ? "Test and Live keep separate merchant codes and secrets."
                        : "Only a Booked Jobs administrator can switch environments."}
                    </p>
                  )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SumUp Merchant Code</Label>
              <Input
                value={merchantCode}
                onChange={(e) => setMerchantCode(e.target.value.toUpperCase())}
                placeholder="e.g. MBBMEYG7"
                autoComplete="off"
                spellCheck={false}
              />
              {errors.merchant
                ? <p className="text-xs text-destructive">{errors.merchant}</p>
                : <p className="text-xs text-muted-foreground">
                    Found in your SumUp dashboard under Profile → Merchant profile. Sandbox and live accounts have different codes.
                  </p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">API Key Secret Name</Label>
              <Input
                value={secretName}
                onChange={(e) => setSecretName(e.target.value)}
                placeholder={environment === "live" ? "e.g. SUMUP_API_KEY_ACME" : "e.g. SUMUP_API_KEY_ACME_TEST"}
                autoComplete="off"
                spellCheck={false}
              />
              {errors.secret
                ? <p className="text-xs text-destructive">{errors.secret}</p>
                : (
                  <p className="text-xs text-muted-foreground">
                    Enter the <strong>name</strong> of the backend secret holding your SumUp API key — never the key itself.
                    {secretName && (
                      <> Secret currently {secretPresent ? "found" : "not found"} on the server.</>
                    )}
                  </p>
                )}
              {mismatch && <p className="text-xs text-destructive">{mismatch}</p>}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleSave} disabled={busy}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Integration
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={busy || !hasConfig}>
                {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plug className="w-4 h-4 mr-2" />}
                Test Connection
              </Button>
              <Button variant="ghost" className="text-destructive hover:text-destructive"
                onClick={() => setConfirmOpen(true)} disabled={busy || !hasConfig}>
                <Unplug className="w-4 h-4 mr-2" />Remove Integration
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                <ChevronUp className="w-4 h-4 mr-2" />Close
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Test Connection only reads your SumUp merchant profile — it never creates a payment.
            </p>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove SumUp integration?</AlertDialogTitle>
            <AlertDialogDescription>
              Your saved merchant code and secret reference will be removed, and card payment links will stop
              working until SumUp is reconnected. Existing payment records are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDisconnect(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
};

export default SumUpIntegrationCard;
