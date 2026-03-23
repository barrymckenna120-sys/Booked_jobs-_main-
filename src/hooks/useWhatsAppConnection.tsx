import React, { createContext, useContext, useState, useCallback } from "react";

interface WhatsAppConnectionContextType {
  hasConnectionError: boolean;
  setConnectionError: (val: boolean) => void;
  clearConnectionError: () => void;
}

const WhatsAppConnectionContext = createContext<WhatsAppConnectionContextType>({
  hasConnectionError: false,
  setConnectionError: () => {},
  clearConnectionError: () => {},
});

export function WhatsAppConnectionProvider({ children }: { children: React.ReactNode }) {
  const [hasConnectionError, setHasConnectionError] = useState(false);

  const setConnectionError = useCallback((val: boolean) => {
    setHasConnectionError(val);
  }, []);

  const clearConnectionError = useCallback(() => {
    setHasConnectionError(false);
  }, []);

  return React.createElement(
    WhatsAppConnectionContext.Provider,
    { value: { hasConnectionError, setConnectionError, clearConnectionError } },
    children
  );
}

export function useWhatsAppConnection() {
  return useContext(WhatsAppConnectionContext);
}
