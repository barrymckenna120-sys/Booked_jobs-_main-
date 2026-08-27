import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/**
 * Scoped offline redirect for the signed-out marketing home only.
 * Mounted exclusively from src/pages/Index.tsx. Do NOT mount globally or
 * inside authenticated app routes — they keep their own loading/error states.
 */
const MarketingOfflineGate = () => {
  const { isOnline } = useNetworkStatus();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isOnline && location.pathname !== "/offline") {
      navigate("/offline", { replace: true });
    }
  }, [isOnline, location.pathname, navigate]);

  return null;
};

export default MarketingOfflineGate;
