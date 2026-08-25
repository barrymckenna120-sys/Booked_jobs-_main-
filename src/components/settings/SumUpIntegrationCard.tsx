import { useCallback, useEffect, useState } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Save, Plug, Unplug } from "lucide-react";

type Status = "loading" | "connected" | "not_connected" | "error";

interface SumUpState {
  merchant_code: string;
  api_key_secret: string;
  secret_present: boolean;
  configured: boolean;
}

const MERCHANT_CODE_RE = /^[A-Z0-9]{4,20}$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{2,120}$/;

/**
 * Tenant-facing SumUp setup. The API key VALUE is never handled here — the form
 * takes the NAME of the backend secret holding it, matching how the payment
 * functions resolve per-organisation credentials.
 */
const SumUpIntegrationCard = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [merchantCode, setMerchantCode] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretPresent, setSecretPresent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<{ merchant?: string; secret?: string }>({});

  const applyState = useCallback((s: SumUpState) => {
    setMerchantCode(s.merchant_code ?? "");
    setSecretName(s.api_key_secret ?? "");
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

  const validate = () => {
    const next: { merchant?: string; secret?: string } = {};
    const code = merchantCode.trim().toUpperCase();
    const secret = secretName.trim();
    if (!code) next.merchant = "Merchant Code is required.";
    else if (!MERCHANT_CODE_RE.test(code)) next.merchant = "4–20 letters or digits, e.g. MBBMEYG7.";
    if (!secret) next.secret = "Secret name is required.";
    else if (/^sup_(sk|pk)/i.test(secret)) next.secret = "That's the key itself — enter the secret's NAME instead.";
    else if (!SECRET_NAME_RE.test(secret)) next.secret = "Uppercase letters, digits and underscores only, e.g. SUMUP_API_KEY_DUBLIN_GAS.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await call("save", {
        merchant_code: merchantCode.trim().toUpperCase(),
        api_key_secret: secretName.trim(),
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
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Connection Error</Badge>;
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
            <CardDescription>Take and track customer card payments through your own SumUp account</CardDescription>
          </div>
          {statusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMessage && (
          <p className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {statusMessage}
          </p>
        )}

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
            : <p className="text-xs text-muted-foreground">Found in your SumUp dashboard under Profile → Merchant profile.</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">API Key Secret Name</Label>
          <Input
            value={secretName}
            onChange={(e) => setSecretName(e.target.value)}
            placeholder="e.g. SUMUP_API_KEY_DUBLIN_GAS"
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
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={handleSave} disabled={busy}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Configuration
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={busy || !hasConfig}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plug className="w-4 h-4 mr-2" />}
            Test Connection
          </Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)} disabled={busy || !hasConfig}>
            <Unplug className="w-4 h-4 mr-2" />Disconnect SumUp
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Test Connection only reads your SumUp merchant profile — it never creates a payment.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect SumUp?</AlertDialogTitle>
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
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default SumUpIntegrationCard;
