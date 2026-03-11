import { createContext, useContext, useRef, useCallback, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface NavigationGuardContextType {
  /** Register a guard. Returns unregister function. Guard returns true to block. */
  registerGuard: (guard: () => boolean) => () => void;
  /** Navigate with guard check. Shows pending state if blocked. */
  guardedNavigate: (to: string | number) => void;
  /** The pending destination (set when guard blocks). Null if not blocked. */
  pendingDestination: string | number | null;
  /** Confirm navigation (discard changes). */
  confirmNavigation: () => void;
  /** Cancel navigation (go back & save). */
  cancelNavigation: () => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextType | null>(null);

export const NavigationGuardProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const guardsRef = useRef<Set<() => boolean>>(new Set());
  const [pendingDestination, setPendingDestination] = useState<string | number | null>(null);

  const registerGuard = useCallback((guard: () => boolean) => {
    guardsRef.current.add(guard);
    return () => { guardsRef.current.delete(guard); };
  }, []);

  const guardedNavigate = useCallback((to: string | number) => {
    const blocked = Array.from(guardsRef.current).some((g) => g());
    if (blocked) {
      setPendingDestination(to);
    } else {
      if (typeof to === "number") navigate(to);
      else navigate(to);
    }
  }, [navigate]);

  const confirmNavigation = useCallback(() => {
    const dest = pendingDestination;
    setPendingDestination(null);
    if (dest !== null) {
      if (typeof dest === "number") navigate(dest);
      else navigate(dest);
    }
  }, [pendingDestination, navigate]);

  const cancelNavigation = useCallback(() => {
    setPendingDestination(null);
  }, []);

  return (
    <NavigationGuardContext.Provider value={{ registerGuard, guardedNavigate, pendingDestination, confirmNavigation, cancelNavigation }}>
      {children}
    </NavigationGuardContext.Provider>
  );
};

export const useNavigationGuard = () => {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  return ctx;
};
