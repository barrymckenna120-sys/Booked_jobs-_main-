import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Save,
  Trash2,
  Edit2,
  X,
  FileText,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Template = {
  id: string;
  name: string;
  message_type: string;
  body: string;
  is_default: boolean;
  updated_at: string;
};

const MESSAGE_TYPES = [
  "30 Day Reminder",
  "7 Day Reminder",
  "Quote Sent",
  "Booking Confirmation",
  "Payment Request",
  "Custom",
];

const VARIABLES = [
  {
    tag: "{customer_name}",
    desc: "Customer's first name",
  },
  {
    tag: "{date}",
    desc: "Next service due date",
  },
  {
    tag: "{phone}",
    desc: "Your WhatsApp number",
  },
  {
    tag: "{business_name}",
    desc: "Your business name",
  },
  {
    tag: "{quote_amount}",
    desc: "Quote total (if applicable)",
  },
];

const WhatsAppTemplates = ({
  embedded = false,
}: {
  embedded?: boolean;
}) => {
  const { user, loading: authLoading } =
    useAuth();

  const { toast } = useToast();

  const [templates, setTemplates] =
    useState<Template[]>([]);

  const [loading, setLoading] =
    useState(true);

  // Edit state
  const [editId, setEditId] =
    useState<string | null>(null);

  const [creating, setCreating] =
    useState(false);

  const [formName, setFormName] =
    useState("");

  const [formType, setFormType] =
    useState("30 Day Reminder");

  const [formBody, setFormBody] =
    useState("");

  const [formDefault, setFormDefault] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const fetchTemplates = async () => {
    if (!user) return;

    setLoading(true);

    const { data } =
      await (supabase as any)
        .from("whatsapp_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("message_type")
        .order("name");

    setTemplates(
      (data || []) as unknown as Template[]
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, [user]);

  const resetForm = () => {
    setEditId(null);
    setCreating(false);
    setFormName("");
    setFormType("30 Day Reminder");
    setFormBody("");
    setFormDefault(false);
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
  };

  const startEdit = (t: Template) => {
    setEditId(t.id);
    setCreating(false);
    setFormName(t.name);
    setFormType(t.message_type);
    setFormBody(t.body);
    setFormDefault(t.is_default);
  };

  const handleSave = async () => {
    if (
      !user ||
      !formName.trim() ||
      !formBody.trim()
    ) {
      toast({
        title:
          "Name and message body are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    // If setting as default, unset others of same type
    if (formDefault) {
      await (supabase as any)
        .from("whatsapp_templates")
        .update({
          is_default: false,
        } as any)
        .eq("user_id", user.id)
        .eq("message_type", formType);
    }

    const payload = {
      user_id: user.id,
      name: formName.trim(),
      message_type: formType,
      body: formBody,
      is_default: formDefault,
    };

    if (editId) {
      const { error } =
        await supabase
          .from("whatsapp_templates")
          .update(payload as any)
          .eq("id", editId);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Template updated",
        });
      }
    } else {
      const { error } =
        await supabase
          .from("whatsapp_templates")
          .insert([payload] as any);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Template created",
        });
      }
    }

    setSaving(false);
    resetForm();
    fetchTemplates();
  };

  const handleDelete = async (
    id: string
  ) => {
    await supabase
      .from("whatsapp_templates")
      .delete()
      .eq("id", id);

    toast({
      title: "Template deleted",
    });

    if (editId === id) {
      resetForm();
    }

    fetchTemplates();
  };

  const insertVariable = (
    tag: string
  ) => {
    setFormBody(
      (prev) => prev + tag
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  const isEditing =
    creating || editId;

  return (
    <div
      className={
        embedded
          ? ""
          : "min-h-screen bg-background"
      }
    >
      {!embedded && (
        <header className="border-b border-border bg-card">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold">
              WhatsApp Templates
            </h1>

            <p className="text-sm text-muted-foreground">
              Create and manage message
              templates for reminders,
              quotes, and bookings
            </p>
          </div>
        </header>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Variable reference */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-bold mb-2">
              Available Variables
            </h3>

            <p className="text-xs text-muted-foreground mb-2">
              Use these in your templates
              — they'll be auto-filled
              when sending.
            </p>

            <div className="flex flex-wrap gap-2">
              {VARIABLES.map((v) => (
                <span
                  key={v.tag}
                  className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-mono cursor-default"
                  title={v.desc}
                >
                  {v.tag}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Create / Edit Form */}
        {isEditing && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">
                  {editId
                    ? "Edit Template"
                    : "New Template"}
                </h3>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetForm}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Template Name *
                  </Label>

                  <Input
                    value={formName}
                    onChange={(e) =>
                      setFormName(
                        e.target.value
                      )
                    }
                    placeholder="e.g. Standard 30 Day Reminder"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Message Type
                  </Label>

                  <Select
                    value={formType}
                    onValueChange={
                      setFormType
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      {MESSAGE_TYPES.map(
                        (t) => (
                          <SelectItem
                            key={t}
                            value={t}
                          >
                            {t}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Message Body *
                </Label>

                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[140px] font-mono"
                  value={formBody}
                  onChange={(e) =>
                    setFormBody(
                      e.target.value
                    )
                  }
                  placeholder="Hi {customer_name}, your boiler service is due on {date}..."
                  rows={6}
                />

                <div className="flex items-center justify-between">
                  <div className="flex gap-1 flex-wrap">
                    {VARIABLES.map(
                      (v) => (
                        <button
                          key={v.tag}
                          onClick={() =>
                            insertVariable(
                              v.tag
                            )
                          }
                          className="text-[10px] bg-muted text-muted-foreground hover:bg-accent px-1.5 py-0.5 rounded font-mono transition-colors"
                          title={`Insert ${v.tag}`}
                        >
                          + {v.tag}
                        </button>
                      )
                    )}
                  </div>

                  <p
                    className={`text-xs ${
                      formBody.length >
                      320
                        ? "text-warning"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formBody.length} / 320
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-default"
                  checked={formDefault}
                  onChange={(e) =>
                    setFormDefault(
                      e.target.checked
                    )
                  }
                  className="rounded border-input"
                />

                <Label
                  htmlFor="is-default"
                  className="text-xs"
                >
                  Set as default template
                  for this message type
                </Label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={resetForm}
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="w-4 h-4 mr-1" />

                  {editId
                    ? "Update Template"
                    : "Save Template"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Template list */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base">
            Your Templates
          </h2>

          {!isEditing && (
            <Button
              size="sm"
              onClick={startCreate}
            >
              <Plus className="w-4 h-4 mr-1" />
              New Template
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">
            Loading...
          </p>
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground" />

              <p className="text-muted-foreground">
                No templates yet
              </p>

              <p className="text-xs text-muted-foreground">
                Create your first template
                to speed up sending
                reminders and messages.
              </p>

              {!isEditing && (
                <Button
                  onClick={startCreate}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Create First Template
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <Card
                key={t.id}
                className={
                  editId === t.id
                    ? "ring-2 ring-primary"
                    : ""
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">
                          {t.name}
                        </h3>

                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {t.message_type}
                        </span>

                        {t.is_default && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-success-light text-success">
                            Default
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 font-mono whitespace-pre-wrap">
                        {t.body}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        Updated{" "}
                        {new Date(
                          t.updated_at
                        ).toLocaleDateString(
                          "en-IE"
                        )}
                      </p>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() =>
                          startEdit(t)
                        }
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger
                          asChild
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>

                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete template?
                            </AlertDialogTitle>

                            <AlertDialogDescription>
                              This will permanently
                              delete "{t.name}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              Cancel
                            </AlertDialogCancel>

                            <AlertDialogAction
                              onClick={() =>
                                handleDelete(
                                  t.id
                                )
                              }
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppTemplates;