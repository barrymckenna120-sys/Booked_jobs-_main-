import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  connectedWhatsAppNumber,
  hasConfigured360Key,
  normaliseApprovedWhatsAppNumber,
} from "@/lib/whatsappTestModeAdmin";

type Integration = {
  integration_type: string;
  config: Record<string, unknown> | null;
};

type AllowedNumber = {
  id: string;
  phone: string;
  created_at: string;
};

type SuppressedMessage = {
  id: string;
  customer_id: string | null;
  recipient_phone: string | null;
  message_type: string | null;
  created_at: string | null;
};

interface Props {
  organisationId: string;
  testMode: boolean;
  integrations: Integration[];
  onTestModeChanged: (testMode: boolean) => void;
}

const formatTimestamp = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Dublin",
      })
    : "—";

export default function WhatsAppTestModeSection({
  organisationId,
  testMode,
  integrations,
  onTestModeChanged,
}: Props) {
  const [allowedNumbers, setAllowedNumbers] = useState<AllowedNumber[]>([]);
  const [suppressedMessages, setSuppressedMessages] = useState<SuppressedMessage[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [numberDraft, setNumberDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);

  const connectedNumber = useMemo(() => connectedWhatsAppNumber(integrations), [integrations]);
  const keyConfigured = useMemo(() => hasConfigured360Key(integrations), [integrations]);

  const loadMessaging = async () => {
    setLoading(true);
    try {
      const [numbersResult, messagesResult] = await Promise.all([
        supabase
          .from("organisation_whatsapp_allowed_numbers")
          .select("id, phone, created_at")
          .eq("organisation_id", organisationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("message_log")
          .select("id, customer_id, recipient_phone, message_type, created_at")
          .eq("organisation_id", organisationId)
          .eq("status", "suppressed_test_mode")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (numbersResult.error) throw numbersResult.error;
      if (messagesResult.error) throw messagesResult.error;
      const messages = (messagesResult.data ?? []) as SuppressedMessage[];
      setAllowedNumbers((numbersResult.data ?? []) as AllowedNumber[]);
      setSuppressedMessages(messages);

      const customerIds = [...new Set(messages.map((row) => row.customer_id).filter(Boolean))] as string[];
      if (customerIds.length === 0) {
        setCustomerNames({});
      } else {
        const { data } = await supabase.from("customers").select("id, name").in("id", customerIds);
        setCustomerNames(
          Object.fromEntries(((data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])),
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load messaging settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMessaging();
  }, [organisationId]);

  const saveTestMode = async (nextValue: boolean) => {
    setSavingMode(true);
    try {
      const { data, error } = await supabase
        .from("organisations")
        .update({ whatsapp_test_mode: nextValue })
        .eq("id", organisationId)
        .select("id, whatsapp_test_mode");
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error("Test mode was not changed");
      onTestModeChanged(nextValue);
      toast.success(nextValue ? "WhatsApp test mode is on" : "WhatsApp test mode is off");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change test mode");
    } finally {
      setSavingMode(false);
      setConfirmLive(false);
    }
  };

  const handleToggle = (checked: boolean) => {
    if (!checked && testMode) {
      setConfirmLive(true);
      return;
    }
    void saveTestMode(checked);
  };

  const addNumber = async () => {
    const phone = normaliseApprovedWhatsAppNumber(numberDraft);
    if (!phone) {
      toast.error("Enter the number in +353 format");
      return;
    }
    setAdding(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Your session has expired");
      const { error } = await supabase.from("organisation_whatsapp_allowed_numbers").insert({
        organisation_id: organisationId,
        phone,
        added_by: userId,
      });
      if (error) throw error;
      setNumberDraft("");
      toast.success("Approved test number added");
      await loadMessaging();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add number";
      toast.error(message.includes("duplicate") ? "That number is already approved" : message);
    } finally {
      setAdding(false);
    }
  };

  const removeNumber = async (id: string) => {
    setRemovingId(id);
    try {
      const { error } = await supabase
        .from("organisation_whatsapp_allowed_numbers")
        .delete()
        .eq("id", id)
        .eq("organisation_id", organisationId);
      if (error) throw error;
      setAllowedNumbers((current) => current.filter((row) => row.id !== id));
      toast.success("Approved test number removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove number");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Messaging</CardTitle>
            </div>
            <Badge
              variant="secondary"
              className={testMode ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}
            >
              WhatsApp: {testMode ? "TEST" : "LIVE"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground">Connected WhatsApp number</div>
              <div className="mt-1 font-medium">{connectedNumber ?? "Not set"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">360 Messenger key</div>
              <div className="mt-1 font-medium">{keyConfigured ? "Set" : "Not set"}</div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="whatsapp-test-mode"
                checked={testMode}
                onCheckedChange={handleToggle}
                disabled={savingMode}
              />
              <Label htmlFor="whatsapp-test-mode">Test mode</Label>
              {savingMode && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          <div className="space-y-3 border-t pt-5">
            <div>
              <h3 className="font-semibold">Approved test numbers</h3>
              <p className="text-sm text-muted-foreground">Only these numbers receive WhatsApp messages while test mode is on.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={numberDraft}
                onChange={(event) => setNumberDraft(event.target.value)}
                placeholder="+353871234567"
                inputMode="tel"
                aria-label="Approved test number"
              />
              <Button onClick={addNumber} disabled={adding || !numberDraft.trim()} className="sm:shrink-0">
                {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add number
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : allowedNumbers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved test numbers.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {allowedNumbers.map((row) => (
                  <div key={row.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                    <span className="font-mono text-sm">{row.phone}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void removeNumber(row.id)}
                      disabled={removingId === row.id}
                      aria-label={`Remove ${row.phone}`}
                    >
                      {removingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-5">
            <div>
              <h3 className="font-semibold">Suppressed messages</h3>
              <p className="text-sm text-muted-foreground">The 50 most recent messages blocked by test mode.</p>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : suppressedMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suppressed messages.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Message type</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppressedMessages.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.customer_id ? customerNames[row.customer_id] ?? "Customer unavailable" : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.recipient_phone ?? "—"}</TableCell>
                        <TableCell>{row.message_type ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatTimestamp(row.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off WhatsApp test mode?</AlertDialogTitle>
            <AlertDialogDescription>
              This company will start sending WhatsApp messages to real customers. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingMode}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveTestMode(false)} disabled={savingMode}>
              {savingMode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}