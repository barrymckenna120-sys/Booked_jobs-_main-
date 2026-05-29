import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { X, Share2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";


const DISMISSED_KEY = "install_banner_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallAppBanner = () => {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstallNative, setCanInstallNative] = useState(false);

  useEffect(() => {
    // Don't show on desktop
    if (window.innerWidth >= 768) return;
    // Don't show in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Don't show if dismissed
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    // Don't show on login/auth page
    if (pathname === "/" || pathname.startsWith("/auth")) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
    const android = /Android/.test(ua);
    setIsIOS(ios);
    setIsAndroid(android);

    // Listen for native install prompt (Android/Chrome)
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstallNative(true);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);

    const timer = setTimeout(() => {
      setVisible(true);
      requestAnimationFrame(() => setAnimateIn(true));
    }, 3000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
    };
  }, []);

  const dismiss = () => {
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(DISMISSED_KEY, "true");
    }, 300);
  };

  const handleNativeInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") {
      dismiss();
    }
    deferredPrompt.current = null;
    setCanInstallNative(false);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-lg p-4 transition-transform duration-300 ease-out ${
        animateIn ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* Close button */}
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 p-2 text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Dismiss"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Header row */}
      <div className="flex items-center gap-3 pr-8">
        <img
          src="/icons/icon-192.png"
          alt="BookedJobs"
          className="w-12 h-12 rounded-xl flex-shrink-0"
        />
        <div>
          <p className="font-bold text-foreground text-sm">Install BookedJobs</p>
          <p className="text-xs text-muted-foreground">
            Add to your home screen for quick access
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-3 space-y-2">
        {isAndroid && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span>Tap the menu ⋮ then "Add to Home Screen"</span>
          </div>
        )}
        {isIOS && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Share2 className="w-4 h-4 flex-shrink-0" />
            <span>Tap Share then "Add to Home Screen"</span>
          </div>
        )}
        {!isAndroid && !isIOS && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span>Use your browser menu to add to home screen</span>
          </div>
        )}
      </div>

      {/* Native install button (Android only) */}
      {isAndroid && canInstallNative && (
        <Button
          onClick={handleNativeInstall}
          className="w-full mt-3 text-white"
          style={{ backgroundColor: "#4A86E8" }}
        >
          Install Now
        </Button>
      )}
    </div>
  );
};

export default InstallAppBanner;
