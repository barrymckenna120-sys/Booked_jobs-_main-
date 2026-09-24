import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Loader2, Search, ShieldAlert, WifiOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EngineerSheet from "./EngineerSheet";
import { openExternalUrl } from "@/lib/openExternal";
import {
  buildBrandModelIndex, filterOptions, findLibraryModel, type PublishedFaultCode, type PublishedFaultModel, loadRecent, modelsForBrand, saveRecent,
  isPreviewHost, resolveFaultResult,
} from "@/lib/faultFinder";

export interface FaultFinderPrefill {
  brand?: string | null;
  model?: string | null;
}

interface Props {
  prefill?: FaultFinderPrefill;
  onClose: () => void;
}

/**
 * Inline searchable list (no popover — iOS-safe).
 * Tap shows ALL options; typing filters. The list sits directly under the
 * field, scrolls independently, and the field is scrolled into view so the
 * list stays above the iPhone keyboard.
 */
const SearchField = ({
  label, value, onChange, onSelect, options, placeholder, disabled, emptyText, hideWhenEmpty, tagFor,
}: {
  label: string; value: string; onChange: (v: string) => void; onSelect: (v: string) => void;
  options: string[]; placeholder: string; disabled?: boolean; emptyText: string; hideWhenEmpty?: boolean; tagFor?: (o: string) => string | null;
}) => {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const matches = typed ? filterOptions(options, value) : options;
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); }}
        onFocus={(e) => {
          setTyped(false); setOpen(true);
          const el = e.currentTarget;
          setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-12 text-base"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-label={label}
      />
      {open && !disabled && !hideWhenEmpty && (
        <div className="mt-1 rounded-xl border border-border bg-card max-h-56 overflow-y-auto overscroll-contain" role="listbox">
          {matches.length === 0 ? (
            <div className="px-3 min-h-[44px] flex items-center text-sm text-muted-foreground">{emptyText}</div>
          ) : matches.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(o); setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); }}
              className={`w-full text-left px-3 min-h-[44px] text-sm font-semibold border-b border-border last:border-b-0 active:bg-muted ${o === value ? "text-primary" : "text-foreground"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span>{o}</span>
                {tagFor?.(o) && (
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{tagFor(o)}</span>
                )}
              </span>
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
  const [submitted, setSubmitted] = useState(false);
  const [offline, setOffline] = useState(false);
  const [draftMode, setDraftMode] = useState(false);

  // Draft testing: superadmin + preview host only. Drafts are still protected by
  // database rules (superadmin-only reads), so this toggle cannot expose them.
  const previewHost = typeof window !== "undefined" && isPreviewHost(window.location.hostname);
  const { data: isSuperadmin = false } = useQuery({
    queryKey: ["fault-finder-superadmin"],
    enabled: previewHost,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await (supabase as any).rpc("is_superadmin", { _user_id: u.user.id });
      return data === true;
    },
  });
  const drafts = previewHost && isSuperadmin && draftMode;
  const statuses = drafts ? ["published", "draft"] : ["published"];

  const { data: index, isLoading } = useQuery({
    queryKey: ["fault-finder-brands"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("boiler_brands").select("brand_name, model_name");
      return buildBrandModelIndex(data || []);
    },
  });

  // Shared technical library — ordinary engineers see published rows only.
  const { data: libModels = [], isError: modelsError, refetch: refetchModels } = useQuery({
    queryKey: ["fault-library-models", drafts],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PublishedFaultModel[]> => {
      const { data, error } = await (supabase as any).from("boiler_fault_models").select("id, brand, model_name").in("status", statuses);
      if (error) throw error;
      return data || [];
    },
  });
  const libModel = findLibraryModel(libModels, brand, model);
  const { data: libCodes = [], isFetching: codesLoading, isError: codesError, refetch: refetchCodes } = useQuery({
    queryKey: ["fault-library-codes", libModel?.id, drafts],
    enabled: !!libModel,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<(PublishedFaultCode & { status?: string })[]> => {
      const { data, error } = await (supabase as any).from("boiler_fault_codes")
        .select("id, code, category, status, explanation, possible_causes, technical_details, manual_title, manual_url, manual_revision, manual_page")
        .eq("model_id", libModel!.id).in("status", statuses).order("code");
      if (error) throw error;
      return data || [];
    },
  });

  const brandOptions = useMemo(() => (index ? [...index.keys()] : []), [index]);
  const modelOptions = useMemo(() => {
    const base = index ? modelsForBrand(index, brand) : [];
    const lib = libModels.filter((m) => m.brand.toLowerCase() === brand.trim().toLowerCase()).map((m) => m.model_name);
    const seen = new Set<string>(); const out: string[] = [];
    [...lib, ...base].forEach((m) => { const k = m.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(m); } });
    return out;
  }, [index, brand, libModels]);
  const codeOptions = useMemo(
    () => [...libCodes].sort((a, b) => Number(a.category === "status") - Number(b.category === "status")).map((c) => c.code),
    [libCodes],
  );
  const codeTag = (o: string) => {
    const c = libCodes.find((x) => x.code === o)?.category;
    return c === "status" ? "Status — not a fault" : c === "message" ? "Display message" : null;
  };
  const [showTech, setShowTech] = useState(false);

  const result = useMemo(
    () => (offline || codesLoading ? { status: "idle" as const } : resolveFaultResult(libCodes, code, brand, submitted)),
    [libCodes, code, brand, submitted, offline, codesLoading],
  );
  const resultIsDraft = result.status === "found" && (result.fault as { status?: string }).status === "draft";

  const changeBrand = (v: string) => {
    if (v.trim().toLowerCase() !== brand.trim().toLowerCase()) { setModel(""); setCode(""); }
    setBrand(v); setSubmitted(false); setShowTech(false);
  };
  const changeModel = (v: string) => { setModel(v); setCode(""); setSubmitted(false); setShowTech(false); };
  const changeCode = (v: string) => { setCode(v.toUpperCase()); setSubmitted(false); setShowTech(false); setOffline(false); };

  const canSearch = !!(brand.trim() && code.trim());

  const find = () => {
    if (!canSearch) return;
    (document.activeElement as HTMLElement | null)?.blur();
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setOffline(true); return; }
    setOffline(false);
    saveRecent(brand.trim(), model.trim());
    setSubmitted(true);
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
          label="Brand" value={brand} placeholder={isLoading ? "Loading brands…" : "Tap to choose a brand"}
          onChange={changeBrand} onSelect={changeBrand} options={brandOptions} emptyText="No matching brand"
        />
        <SearchField
          label="Model" value={model}
          placeholder={brand.trim() ? "Tap to choose a model (optional)" : "Choose a brand first"}
          disabled={!brand.trim()}
          onChange={(v) => { setModel(v); setCode(""); setResult(null); }}
          onSelect={(v) => { setModel(v); setCode(""); setResult(null); }}
          options={modelOptions} emptyText="No models on file for this brand — type the model"
        />
        <SearchField
          label="Fault code" value={code}
          placeholder={codesLoading ? "Loading codes…" : codeOptions.length ? "Tap to choose or type a code" : "Type the code, e.g. E133"}
          onChange={(v) => { setCode(v.toUpperCase()); setResult(null); }}
          onSelect={(v) => { setCode(v); setResult(null); }}
          options={codeOptions} tagFor={codeTag}
          emptyText={libModel ? "No matching verified code — search to see the manual" : "No verified codes for this model yet — type the code"}
          hideWhenEmpty={!codeOptions.length}
        />
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

        {result?.status === "found" && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="fault-found">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{result.brand} · {model} · {result.fault.code}</div>
              {result.fault.category === "status" && (
                <div className="inline-block mt-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Status message — not a fault</div>
              )}
              {result.fault.category === "message" && (
                <div className="inline-block mt-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Display message (no numbered code)</div>
              )}
              <div className="text-base font-extrabold text-foreground mt-0.5">{result.fault.explanation}</div>
            </div>
            {result.fault.possible_causes.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Possible causes</div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                  {result.fault.possible_causes.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}
            <Button type="button" className="w-full h-12 text-base font-bold gap-2" onClick={() => openExternalUrl(result.fault.manual_url)}>
              <ExternalLink className="w-4 h-4" /> Open official manual
            </Button>
            <button type="button" aria-expanded={showTech} onClick={() => setShowTech((v) => !v)}
              className="w-full min-h-[44px] flex items-center justify-between text-sm font-semibold text-foreground border-t border-border pt-2">
              Technical details &amp; manual reference
              <ChevronDown className={`w-4 h-4 transition-transform ${showTech ? "rotate-180" : ""}`} />
            </button>
            {showTech && (
              <div className="text-sm text-foreground space-y-2">
                {result.fault.technical_details && <p className="whitespace-pre-line">{result.fault.technical_details}</p>}
                <p className="text-xs text-muted-foreground">
                  {result.fault.manual_title}
                  {result.fault.manual_revision && <> · {result.fault.manual_revision}</>}
                  {result.fault.manual_page && <> · page {result.fault.manual_page}</>}
                </p>
              </div>
            )}
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
