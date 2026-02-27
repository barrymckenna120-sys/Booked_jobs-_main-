import { useEffect, useRef } from "react";

/**
 * Pushes a dummy history entry when `isOpen` becomes true.
 * When the user presses the browser back button, calls `onClose`
 * instead of navigating away.
 */
export const useBackButton = (isOpen: boolean, onClose: () => void) => {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      pushedRef.current = false;
      return;
    }

    // Push a dummy state so "back" triggers popstate instead of leaving
    window.history.pushState({ panel: true }, "");
    pushedRef.current = true;

    const handlePopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onClose();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // If the panel closes programmatically (not via back button),
      // remove the dummy entry by replacing current state instead of
      // calling history.back() which would navigate away from the page
      if (pushedRef.current) {
        pushedRef.current = false;
        // Replace the dummy state with a clean one — no navigation occurs
        window.history.replaceState(null, "", window.location.href);
      }
    };
  }, [isOpen, onClose]);
};
