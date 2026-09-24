import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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

/** Direct link (/engineer/fault-finder): opens the shared sheet over Today. */
export const FaultFinderRoute = () => {
  const open = useContext(FaultFinderContext);
  const navigate = useNavigate();
  useEffect(() => { open?.(); navigate("/engineer/today", { replace: true }); }, [open, navigate]);
  return null;
};

/** Returns null outside the engineer workspace — callers hide the entry point. */
export const useFaultFinder = () => useContext(FaultFinderContext);
