import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, Loader2, Package } from "lucide-react";
import CategoriesTab from "@/components/products/CategoriesTab";
import { useOrgId } from "@/hooks/useOrgId";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

type Product = {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  cost_price: number | null;
  active: boolean;
  category: string | null;
  created_at: string;
};

type Category = {
  id: string;
  name: string;
};

const Products = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrgId();
  const { user } = useAuth();
  const { canAccessOffice } = useUserRole(user);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", description: "", unit_price: "", cost_price: "", active: true, category: "" });
  const [saving, setSaving] = useState(false);


  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return (data || []) as Category[];
    },
  });

  const categoryNames = categories.map((c) => c.name);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return (data || []) as Product[];
    },
  });

  const filtered = products.filter((p) => {
    if (!showInactive && !p.active) return false;
    if (categoryFilter !== "All" && (p.category || "") !== categoryFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!p.name.toLowerCase().includes(s) && !(p.description || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "", unit_price: "", cost_price: "", active: true, category: categoryNames[0] || "" });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description || "",
      unit_price: String(p.unit_price),
      cost_price: p.cost_price == null ? "" : String(p.cost_price),
      active: p.active,
      category: p.category || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.unit_price) {
      toast({ title: "Name and Price are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      unit_price: parseFloat(form.unit_price) || 0,
      active: form.active,
      category: form.category || null,
    };
    if (canAccessOffice) {
      payload.cost_price = form.cost_price === "" ? null : parseFloat(form.cost_price);
    }


    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Product updated" });
    } else {
      if (!orgId) { toast({ title: "Organisation not ready", description: "Please retry in a moment.", variant: "destructive" }); setSaving(false); return; }
      const { error } = await supabase.from("products").insert({ ...payload, organisation_id: orgId });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Product added" });
    }
    setSaving(false);
    setModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const softDelete = async (p: Product) => {
    await supabase.from("products").update({ active: false }).eq("id", p.id);
    toast({ title: `${p.name} deactivated` });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold text-foreground mb-6">Products & Parts</h1>

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-1.5">
              {["All", ...categoryNames].map((cat) => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
            <Button onClick={openAdd} size="sm"><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
              <Label htmlFor="show-inactive" className="text-sm text-muted-foreground whitespace-nowrap">Show inactive</Label>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center space-y-2">
                <Package className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground">No products found</p>
                <Button variant="outline" size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add your first product</Button>
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
                      <th className="px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Category</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Price</th>
                      {canAccessOffice && (
                        <>
                          <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Cost</th>
                          <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Margin %</th>
                          <th className="px-4 py-3 font-semibold text-muted-foreground text-right">GP €</th>
                        </>
                      )}
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Active</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const sale = Number(p.unit_price) || 0;
                      const hasCost = p.cost_price !== null && p.cost_price !== undefined;
                      const cost = hasCost ? Number(p.cost_price) : null;
                      const gp = cost === null ? null : sale - cost;
                      const margin = cost === null || sale <= 0 ? null : ((sale - cost) / sale) * 100;
                      return (
                      <tr key={p.id} className={`border-b border-border last:border-0 ${!p.active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">{p.description || "—"}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {p.category ? <Badge variant="secondary" className="text-xs">{p.category}</Badge> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">€{sale.toFixed(2)}</td>
                        {canAccessOffice && (
                          <>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {cost === null ? "—" : `€${cost.toFixed(2)}`}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">
                              {margin === null ? "—" : `${margin.toFixed(1)}%`}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              {gp === null ? "—" : `€${gp.toFixed(2)}`}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${p.active ? "bg-success" : "bg-muted-foreground/30"}`} />
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {p.active && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => softDelete(p)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}

                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Product Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Expansion Vessel" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  {categoryNames.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Unit Price € *</Label>
              <Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0.00" />
            </div>
            {canAccessOffice && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cost Price €</Label>
                <Input
                  type="number"
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label className="text-sm">Active</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editing ? "Update" : "Add Product"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
