import { useEffect, useRef } from "react";

/**
 * Pushes a dummy history entry when `isOpen` becomes true.
 * When the user presses the browser back button, calls `onClose`
 * instead of navigating away. Safely tracks whether a dummy entry
 * was pushed to avoid corrupting the history stack.
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

    const handlePopState = (e: PopStateEvent) => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onClose();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // If the panel closes programmatically (not via back button),
      // clean up the dummy history entry we pushed
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [isOpen, onClose]);
};
