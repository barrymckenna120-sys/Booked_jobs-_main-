import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Pencil, Trash2, Plus, Save, X } from "lucide-react";

interface BrandRow {
  id: string;
  brand_name: string;
  model_name: string | null;
  warranty_years: number;
  is_default: boolean;
}

const BoilerBrandsTab = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState("");
  const [editYears, setEditYears] = useState(0);
  const [editModel, setEditModel] = useState("");
  const [addingBrand, setAddingBrand] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [newYears, setNewYears] = useState(10);
  const [newModelBrand, setNewModelBrand] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelYears, setNewModelYears] = useState(10);
  const [customerCounts, setCustomerCounts] = useState<Record<string, number>>({});

  const fetchData = async () => {
    setLoading(true);
    const [brandsRes, custRes] = await Promise.all([
      supabase.from("boiler_brands").select("id, brand_name, model_name, warranty_years, is_default").order("brand_name"),
      supabase.from("customers").select("boiler_make_model").not("boiler_make_model", "is", null),
    ]);
    setRows((brandsRes.data || []) as BrandRow[]);

    const counts: Record<string, number> = {};
    (custRes.data || []).forEach((c: any) => {
      const mm = (c.boiler_make_model || "").trim().toLowerCase();
      (brandsRes.data || []).forEach((b: any) => {
        if (b.is_default && mm.includes(b.brand_name.toLowerCase())) {
          counts[b.brand_name] = (counts[b.brand_name] || 0) + 1;
        }
      });
    });
    setCustomerCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const defaults = rows.filter((r) => r.is_default);
  const overrides = rows.filter((r) => !r.is_default);
  const distinctBrands = [...new Set(defaults.map((d) => d.brand_name))].sort();

  const startEdit = (row: BrandRow) => {
    setEditingId(row.id);
    setEditBrand(row.brand_name);
    setEditModel(row.model_name || "");
    setEditYears(row.warranty_years);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (row: BrandRow) => {
    const updates: any = { warranty_years: editYears };
    if (row.is_default) updates.brand_name = editBrand;
    else updates.model_name = editModel;

    const { error } = await supabase.from("boiler_brands").update(updates).eq("id", row.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved" });
      setEditingId(null);
      fetchData();
    }
  };

  const deleteBrand = async (row: BrandRow) => {
    if (row.is_default) {
      const count = customerCounts[row.brand_name] || 0;
      if (count > 0) {
        toast({
          title: "Cannot delete",
          description: `${count} customer${count !== 1 ? "s" : ""} use this brand. Update their records before deleting.`,
          variant: "destructive",
        });
        return;
      }
    }
    const { error } = await supabase.from("boiler_brands").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      fetchData();
    }
  };

  const addBrandDefault = async () => {
    if (!newBrand.trim()) return;
    const { error } = await supabase.from("boiler_brands").insert({
      brand_name: newBrand.trim(),
      warranty_years: newYears,
      is_default: true,
      model_name: null,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Brand added" });
      setAddingBrand(false);
      setNewBrand("");
      setNewYears(10);
      fetchData();
    }
  };

  const addModelOverride = async () => {
    if (!newModelBrand || !newModelName.trim()) return;
    const { error } = await supabase.from("boiler_brands").insert({
      brand_name: newModelBrand,
      model_name: newModelName.trim(),
      warranty_years: newModelYears,
      is_default: false,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Model override added" });
      setAddingModel(false);
      setNewModelBrand("");
      setNewModelName("");
      setNewModelYears(10);
      fetchData();
    }
  };

  if (loading) {
    return <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mx-auto mt-8" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Boiler Brands & Warranty</h2>
        <p className="text-sm text-muted-foreground mb-4">Manage default warranty periods per brand and model-specific overrides.</p>
      </div>

      {/* Brand Defaults */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Brand Defaults</h3>
        <div className="space-y-2">
          {defaults.map((row) => (
            <div key={row.id} className="flex items-center gap-2 py-2 border-b last:border-0">
              {editingId === row.id ? (
                <>
                  <Input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} className="flex-1" />
                  <Input type="number" value={editYears} onChange={(e) => setEditYears(Number(e.target.value))} className="w-20" min={1} />
                  <span className="text-xs text-muted-foreground">yrs</span>
                  <Button size="sm" variant="ghost" onClick={() => saveEdit(row)}><Save className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{row.brand_name}</span>
                  <span className="text-sm text-muted-foreground">{row.warranty_years} yrs</span>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(row)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteBrand(row)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </>
              )}
            </div>
          ))}
        </div>

        {addingBrand ? (
          <div className="flex items-center gap-2 mt-3">
            <Input placeholder="Brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className="flex-1" />
            <Input type="number" value={newYears} onChange={(e) => setNewYears(Number(e.target.value))} className="w-20" min={1} />
            <span className="text-xs text-muted-foreground">yrs</span>
            <Button size="sm" onClick={addBrandDefault}><Save className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingBrand(false)}><X className="w-4 h-4" /></Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddingBrand(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Brand
          </Button>
        )}
      </Card>

      {/* Model Overrides */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Model Overrides</h3>
        <p className="text-xs text-muted-foreground mb-3">Override warranty years for specific models. These take priority over the brand default.</p>
        <div className="space-y-2">
          {overrides.map((row) => (
            <div key={row.id} className="flex items-center gap-2 py-2 border-b last:border-0">
              {editingId === row.id ? (
                <>
                  <span className="text-sm text-muted-foreground">{row.brand_name}</span>
                  <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} className="flex-1" />
                  <Input type="number" value={editYears} onChange={(e) => setEditYears(Number(e.target.value))} className="w-20" min={1} />
                  <span className="text-xs text-muted-foreground">yrs</span>
                  <Button size="sm" variant="ghost" onClick={() => saveEdit(row)}><Save className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">{row.brand_name}</span>
                  <span className="flex-1 text-sm font-medium">{row.model_name}</span>
                  <span className="text-sm text-muted-foreground">{row.warranty_years} yrs</span>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(row)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteBrand(row)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </>
              )}
            </div>
          ))}
          {overrides.length === 0 && <p className="text-sm text-muted-foreground">No model overrides yet.</p>}
        </div>

        {addingModel ? (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Select value={newModelBrand} onValueChange={setNewModelBrand}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                {distinctBrands.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Model name" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} className="flex-1" />
            <Input type="number" value={newModelYears} onChange={(e) => setNewModelYears(Number(e.target.value))} className="w-20" min={1} />
            <span className="text-xs text-muted-foreground">yrs</span>
            <Button size="sm" onClick={addModelOverride}><Save className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingModel(false)}><X className="w-4 h-4" /></Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddingModel(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Model Override
          </Button>
        )}
      </Card>
    </div>
  );
};

export default BoilerBrandsTab;
