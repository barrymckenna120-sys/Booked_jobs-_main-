import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import FaultFinderSheet, { type FaultFinderPrefill } from "./FaultFinderSheet";

type OpenFaultFinder = (prefill?: FaultFinderPrefill) => void;

const FaultFinderContext = createContext<OpenFaultFinder | null>(null);

/** Mounts a single Fault Finder sheet for the whole engineer workspace. */
export const FaultFinderProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<{ prefill?: FaultFinderPrefill } | null>(null);
  const open = useCallback<OpenFaultFinder>((prefill) => setState({ prefill }), []);
  return (
    <FaultFinderContext.Provider value={open}>
      {children}
      {state && <FaultFinderSheet prefill={state.prefill} onClose={() => setState(null)} />}
    </FaultFinderContext.Provider>
  );
};

/** Returns null outside the engineer workspace — callers hide the entry point. */
export const useFaultFinder = () => useContext(FaultFinderContext);
