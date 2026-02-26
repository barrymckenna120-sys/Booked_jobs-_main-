import { useEffect } from "react";

/**
 * Pushes a dummy history entry when `isOpen` becomes true.
 * When the user presses the browser back button, calls `onClose`
 * instead of navigating away.
 */
export const useBackButton = (isOpen: boolean, onClose: () => void) => {
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ panel: true }, "");

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen, onClose]);
};
