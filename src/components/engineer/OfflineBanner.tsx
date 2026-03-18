import { useState, useEffect } from "react";

const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: isOffline ? 40 : 0, opacity: isOffline ? 1 : 0 }}
    >
      <div className="w-full bg-[#F59E0B] text-white text-sm font-bold text-center py-2">
        ⚠️ No internet connection — job updates may not save
      </div>
    </div>
  );
};

export default OfflineBanner;
