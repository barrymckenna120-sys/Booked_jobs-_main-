import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrgId } from "@/hooks/useOrgId";
import {
  buildCategoryInsert,
  buildCategoryUpdate,
} from "@/lib/categoryPayload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Loader2, Tag } from "lucide-react";

type Category = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

const CategoriesTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrgId();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // Defence in depth: RLS already scopes this, the filter keeps the list
      // tenant-correct even if a policy regresses.
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("organisation_id", orgId!)
        .order("name");
      return (data || []) as Category[];
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);

    if (editing) {
      const built = buildCategoryUpdate(form);
      if (!built.ok) {
        toast({ title: "Category name is required", variant: "destructive" });
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("categories").update(built.payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Category updated" });
    } else {
      const built = buildCategoryInsert(form, orgId);
      if (!built.ok) {
        toast(
          built.reason === "missing-org"
            ? { title: "Organisation not ready", description: "Please retry in a moment.", variant: "destructive" }
            : { title: "Category name is required", variant: "destructive" }
        );
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("categories").insert(built.payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Category added" });
    }
    setSaving(false);
    setModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };


  const handleDelete = async (c: Category) => {
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${c.name} deleted` });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Manage categories for your products and parts.</p>
        <Button onClick={openAdd} size="sm"><Plus className="w-4 h-4 mr-1" /> Add Category</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : categories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-2">
            <Tag className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No categories yet</p>
            <Button variant="outline" size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add your first category</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Description</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell truncate max-w-[300px]">{c.description || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(c)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Boilers" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description…" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editing ? "Update" : "Add Category"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CategoriesTab;
