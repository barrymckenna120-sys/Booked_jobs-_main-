import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X, MessageCircle, Loader2, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const MAX_REPLIES = 10;

interface QuickReply {
  id: string;
  text: string;
  sort_order: number;
}

const QuickRepliesTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuickReply | null>(null);

  const fetchReplies = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("quick_replies")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });
    setReplies((data as QuickReply[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReplies();
  }, [user]);

  const handleAdd = async () => {
    if (!newText.trim() || !user || replies.length >= MAX_REPLIES) return;
    setSaving(true);
    const { error } = await supabase.from("quick_replies").insert({
      user_id: user.id,
      text: newText.trim(),
      sort_order: replies.length,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Error adding reply", description: error.message, variant: "destructive" });
    } else {
      setNewText("");
      setAdding(false);
      fetchReplies();
      toast({ title: "Quick reply added" });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("quick_replies")
      .update({ text: editText.trim() } as any)
      .eq("id", editingId);
    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      setEditingId(null);
      fetchReplies();
      toast({ title: "Quick reply updated" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("quick_replies").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      setDeleteTarget(null);
      fetchReplies();
      toast({ title: "Quick reply deleted" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground">Quick Replies</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the preset messages your engineers see as quick reply chips on the job detail screen.
        </p>
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-muted-foreground">
          {replies.length} / {MAX_REPLIES} quick replies
        </span>
        {!adding && replies.length < MAX_REPLIES && (
          <Button size="sm" className="gap-1.5 font-bold" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add Reply
          </Button>
        )}
      </div>

      {/* Add new */}
      {adding && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="e.g. Customer not home"
            className="text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newText.trim()) handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewText(""); }
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" className="gap-1 font-bold" onClick={handleAdd} disabled={!newText.trim() || saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewText(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {replies.length === 0 && !adding && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No quick replies yet. Add your first one above.
          </div>
        )}
        {replies.map((r) => (
          <div
            key={r.id}
            className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 group"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            {editingId === r.id ? (
              <div className="flex-1 flex items-center gap-2">
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="text-sm h-9 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editText.trim()) handleSaveEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={handleSaveEdit} disabled={!editText.trim() || saving}>
                  <Check className="w-4 h-4 text-primary" />
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-foreground">{r.text}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => { setEditingId(r.id); setEditText(r.text); }}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setDeleteTarget(r)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Quick Reply</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.text}"? Engineers will no longer see this option.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuickRepliesTab;
