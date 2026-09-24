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
  isPreviewHost, resolveFaultResult, mergeModelOptions,
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
  label, value, onChange, onSelect, options, placeholder, disabled, emptyText, hideWhenEmpty, tagFor, extraOption, onExtra,
}: {
  label: string; value: string; onChange: (v: string) => void; onSelect: (v: string) => void;
  options: string[]; placeholder: string; disabled?: boolean; emptyText: string; hideWhenEmpty?: boolean; tagFor?: (o: string) => string | null;
  extraOption?: string; onExtra?: () => void;
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
          {extraOption && (
            <button type="button" role="option" aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onExtra?.(); setOpen(false); }}
              className="w-full text-left px-3 min-h-[44px] text-sm font-semibold text-primary border-t border-border active:bg-muted">
              {extraOption}
            </button>
          )}
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
  const [draftMode, setDraftMode] = useState(true);

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
  // Named K&N-style draft testers: enforced by database rules (per-user + per-company switch).
  const { data: isDraftTester = false } = useQuery({
    queryKey: ["fault-finder-draft-tester"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await (supabase as any).rpc("can_view_draft_faults", { _user_id: u.user.id });
      return data === true;
    },
  });
  // Superadmin kill switch for each company's draft testing.
  const { data: testOrgs = [], refetch: refetchTestOrgs } = useQuery({
    queryKey: ["fault-draft-test-orgs"],
    enabled: isSuperadmin,
    queryFn: async (): Promise<{ organisation_id: string; enabled: boolean; organisations: { name: string } | null }[]> => {
      const { data } = await (supabase as any).from("fault_draft_test_orgs").select("organisation_id, enabled, organisations(name)");
      return data || [];
    },
  });
  const setOrgTesting = async (orgId: string, enabled: boolean) => {
    await (supabase as any).from("fault_draft_test_orgs").update({ enabled }).eq("organisation_id", orgId);
    refetchTestOrgs();
  };
  const drafts = (previewHost && isSuperadmin && draftMode) || isDraftTester;
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
        .select("id, code, category, status, draft_test_excluded, explanation, possible_causes, technical_details, manual_title, manual_url, manual_revision, manual_page")
        .eq("model_id", libModel!.id).in("status", statuses).order("code");
      if (error) throw error;
      // Unresolved review entries are never part of draft testing results.
      return (data || []).filter((c: { status?: string; draft_test_excluded?: boolean }) => !(c.status === "draft" && c.draft_test_excluded));
    },
  });

  const brandOptions = useMemo(() => (index ? [...index.keys()] : []), [index]);
  const modelOptions = useMemo(() => {
    const base = index ? modelsForBrand(index, brand) : [];
    const lib = libModels.filter((m) => m.brand.toLowerCase() === brand.trim().toLowerCase()).map((m) => m.model_name);
    return mergeModelOptions(lib, base);
  }, [index, brand, libModels]);
  const codeOptions = useMemo(
    () => [...libCodes].sort((a, b) => Number(a.category === "status") - Number(b.category === "status")).map((c) => c.code),
    [libCodes],
  );
  const codeTag = (o: string) => {
    const row = libCodes.find((x) => x.code === o);
    const c = row?.category;
    const kind = c === "status" ? "Status — not a fault" : c === "message" ? "Display message" : null;
    const draft = row?.status === "draft" ? "DRAFT / NOT VERIFIED" : null;
    return [draft, kind].filter(Boolean).join(" · ") || null;
  };
  const noCodesForModel = !!model.trim() && !codesLoading && !codesError && codeOptions.length === 0;
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

      {previewHost && isSuperadmin && (
        <label className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3 min-h-[44px] text-sm font-semibold text-foreground">
          <span>Draft testing mode <span className="block text-[11px] font-normal text-muted-foreground">Superadmin preview only — engineers never see drafts</span></span>
          <input type="checkbox" aria-label="Draft testing mode" className="w-5 h-5" checked={draftMode}
            onChange={(e) => { setDraftMode(e.target.checked); setSubmitted(false); }} />
        </label>
      )}

      {isSuperadmin && testOrgs.map((o) => (
        <label key={o.organisation_id} className="mx-5 mt-2 flex items-center justify-between gap-3 rounded-xl border border-border px-3 min-h-[44px] text-sm font-semibold text-foreground">
          <span>Draft testing for {o.organisations?.name ?? "company"} <span className="block text-[11px] font-normal text-muted-foreground">Named testers only · switch off when testing ends</span></span>
          <input type="checkbox" aria-label={`Draft testing for ${o.organisations?.name ?? "company"}`} className="w-5 h-5" checked={o.enabled}
            onChange={(e) => setOrgTesting(o.organisation_id, e.target.checked)} />
        </label>
      ))}
      {isDraftTester && !isSuperadmin && (
        <div className="mx-5 mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-bold text-foreground">
          DRAFT TESTING — results are NOT technically verified. Always check the official manual.
        </div>
      )}

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
          onChange={changeModel} onSelect={changeModel}
          options={modelOptions} emptyText="No models on file for this brand — type the model"
        />
        <SearchField
          label="Fault code" value={code}
          placeholder={codesLoading ? "Loading codes…" : codeOptions.length ? "Tap to choose or type a code" : "Type the code, e.g. E133"}
          onChange={changeCode}
          onSelect={(v) => { setCode(v); setSubmitted(true); setShowTech(false); saveRecent(brand.trim(), model.trim()); }}
          options={codeOptions} tagFor={codeTag}
          emptyText={codeOptions.length ? "Code not listed — press Find Fault to check" : "No verified fault codes available for this model yet"}
          extraOption="Other / code not listed"
          onExtra={() => { setCode(""); setSubmitted(false); setTimeout(() => (document.querySelector('input[aria-label="Fault code"]') as HTMLInputElement | null)?.focus(), 0); }}
        />
        {noCodesForModel && (
          <div className="text-xs text-muted-foreground" data-testid="fault-no-codes">
            No verified fault codes available for this model yet. Type the code shown on the boiler to check it.
          </div>
        )}
        <Button type="submit" className="w-full h-12 text-base font-extrabold gap-2" disabled={!canSearch}>
          {codesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find Fault
        </Button>
      </form>

      <div className="px-5 pt-4 space-y-3">
        {codesLoading && code.trim() && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="fault-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading fault codes…
          </div>
        )}

        {(modelsError || codesError) && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 space-y-2" data-testid="fault-error">
            <div className="text-sm text-foreground">Couldn't load the fault library. Check your connection and try again.</div>
            <Button type="button" variant="outline" className="h-11" onClick={() => { refetchModels(); refetchCodes(); }}>Try again</Button>
          </div>
        )}

        {offline && (
          <div className="rounded-xl border border-border bg-secondary p-4 flex gap-3">
            <WifiOff className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="text-sm text-foreground">You're offline. Connect to look up a fault code or open the manual.</div>
          </div>
        )}

        {result.status === "found" && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="fault-found">
            {resultIsDraft && (
              <div className="rounded-lg bg-warning/15 border border-warning/40 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
                DRAFT — NOT TECHNICALLY VERIFIED
              </div>
            )}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{brand} · {model} · {result.fault.code}</div>
              {result.fault.category === "status" && (
                <div className="inline-block mt-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Status message — not a fault</div>
              )}
              {result.fault.category === "message" && (
                <div className="inline-block mt-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Display message (no numbered code)</div>
              )}
              <div className="text-base font-extrabold text-foreground mt-0.5">{result.fault.explanation}</div>
            </div>
            {(result.fault.possible_causes?.length ?? 0) > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{resultIsDraft ? "Possible causes — unverified, not repair instructions" : "Possible causes"}</div>
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
                {resultIsDraft && <p className="text-xs font-bold text-foreground">Unverified draft notes — confirm against the official manual before acting.</p>}
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

        {result.status === "unknown" && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="fault-unknown">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{brand} · {code.trim().toUpperCase()}</div>
              <div className="text-base font-extrabold text-foreground mt-0.5">No verified explanation available for this code yet</div>
              <div className="text-sm text-muted-foreground mt-1">
                Check this code in the official manual for the exact model.
              </div>
            </div>
            {result.manualUrl ? (
              <Button type="button" className="w-full h-12 text-base font-bold gap-2" onClick={() => openExternalUrl(result.manualUrl!)}>
                <ExternalLink className="w-4 h-4" /> Open official {brand} manual
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
