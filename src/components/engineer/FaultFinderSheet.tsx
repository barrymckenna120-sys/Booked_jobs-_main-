import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Search, ShieldAlert, WifiOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EngineerSheet from "./EngineerSheet";
import { openExternalUrl } from "@/lib/openExternal";
import {
  buildBrandModelIndex, filterOptions, loadRecent, lookupFault, saveRecent, type FaultLookupResult,
} from "@/lib/faultFinder";

export interface FaultFinderPrefill {
  brand?: string | null;
  model?: string | null;
}

interface Props {
  prefill?: FaultFinderPrefill;
  onClose: () => void;
}

/** Inline searchable list (no popover — iOS-safe). */
const SearchField = ({
  label, value, onChange, options, placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const matches = filterOptions(options, value).slice(0, 8);
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-12 text-base"
        autoComplete="off"
      />
      {open && matches.length > 0 && !(matches.length === 1 && matches[0] === value) && (
        <div className="mt-1 rounded-xl border border-border bg-card overflow-hidden" role="listbox">
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o); setOpen(false); }}
              className="w-full text-left px-3 min-h-[44px] text-sm font-semibold text-foreground border-b border-border last:border-b-0 active:bg-muted"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const FaultFinderSheet = ({ prefill, onClose }: Props) => {
  const recent = useMemo(() => loadRecent(), []);
  const hasPrefill = !!(prefill?.brand?.trim() || prefill?.model?.trim());
  const [brand, setBrand] = useState((hasPrefill ? prefill?.brand : recent?.brand)?.trim() ?? "");
  const [model, setModel] = useState((hasPrefill ? prefill?.model : recent?.model)?.trim() ?? "");
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<(FaultLookupResult & { code: string; brand: string }) | null>(null);
  const [offline, setOffline] = useState(false);

  const { data: index, isLoading } = useQuery({
    queryKey: ["fault-finder-brands"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("boiler_brands").select("brand_name, model_name");
      return buildBrandModelIndex(data || []);
    },
  });

  const brandOptions = useMemo(() => (index ? [...index.keys()] : []), [index]);
  const modelOptions = useMemo(() => {
    if (!index) return [];
    const key = [...index.keys()].find((k) => k.toLowerCase() === brand.trim().toLowerCase());
    return key ? index.get(key)! : [];
  }, [index, brand]);

  const canSearch = brand.trim() && code.trim() && !searching;

  const find = async () => {
    if (!canSearch) return;
    (document.activeElement as HTMLElement | null)?.blur();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOffline(true); setResult(null); return;
    }
    setOffline(false); setSearching(true);
    saveRecent(brand.trim(), model.trim());
    const r = await lookupFault(brand.trim(), model.trim(), code.trim());
    setResult({ ...r, code: code.trim().toUpperCase(), brand: brand.trim() });
    setSearching(false);
  };

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-3 border-b border-border">
        <div className="min-w-0">
          <div className="text-lg font-extrabold text-foreground">Fault Finder</div>
          <div className="text-xs text-muted-foreground">Preview — verified fault library coming soon</div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-muted-foreground active:bg-muted">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form
        className="px-5 pt-4 space-y-3"
        onSubmit={(e) => { e.preventDefault(); find(); }}
      >
        <SearchField
          label="Brand" value={brand} placeholder={isLoading ? "Loading brands…" : "e.g. Baxi"}
          onChange={(v) => { setBrand(v); setResult(null); }} options={brandOptions}
        />
        <SearchField
          label="Model" value={model} placeholder="e.g. 800 Combi (optional)"
          onChange={(v) => { setModel(v); setResult(null); }} options={modelOptions}
        />
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Fault code</label>
          <Input
            value={code}
            onChange={(e) => { setCode(e.target.value); setResult(null); }}
            placeholder="e.g. E133"
            className="h-12 text-base uppercase"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <Button type="submit" className="w-full h-12 text-base font-extrabold gap-2" disabled={!canSearch}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find Fault
        </Button>
      </form>

      <div className="px-5 pt-4 space-y-3">
        {offline && (
          <div className="rounded-xl border border-border bg-secondary p-4 flex gap-3">
            <WifiOff className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="text-sm text-foreground">You're offline. Connect to look up a fault code or open the manual.</div>
          </div>
        )}

        {result?.status === "unknown" && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="fault-unknown">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{result.brand} · {result.code}</div>
              <div className="text-base font-extrabold text-foreground mt-0.5">Code not in the verified library yet</div>
              <div className="text-sm text-muted-foreground mt-1">
                We don't show diagnoses until they're checked against the manufacturer's manual. Look up this code in the official manual for the exact model.
              </div>
            </div>
            {result.manualUrl ? (
              <Button type="button" className="w-full h-12 text-base font-bold gap-2" onClick={() => openExternalUrl(result.manualUrl!)}>
                <ExternalLink className="w-4 h-4" /> Open official {result.brand} manuals
              </Button>
            ) : (
              <div className="text-sm text-foreground">No official manual link on file for this brand — check the manufacturer's website.</div>
            )}
          </div>
        )}

        <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 flex gap-2.5">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-foreground leading-snug">
            For RGI / qualified engineers only. Never bypass combustion, flue, gas or electrical safety devices. Always follow the manufacturer's instructions.
          </div>
        </div>
      </div>
    </EngineerSheet>
  );
};

export default FaultFinderSheet;
