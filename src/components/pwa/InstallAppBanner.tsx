import { useState, useEffect, useRef, memo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { X, Share2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";


const DISMISSED_KEY = "install_banner_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallAppBannerInner = () => {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstallNative, setCanInstallNative] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const renderCount = useRef(0);
  renderCount.current += 1;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    console.log("[InstallAppBanner] mounted");
    return () => console.log("[InstallAppBanner] unmounted");
  }, []);

  useEffect(() => {
    console.log("[InstallAppBanner] re-rendered", { count: renderCount.current });
  });

  useEffect(() => {
    if (['/auth', '/', '/dashboard', '/engineer'].some(p => pathname.startsWith(p))) return;

    // Don't show on desktop
    if (window.innerWidth >= 768) return;
    // Don't show in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Don't show if dismissed
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;

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
      if (['/auth', '/', '/dashboard', '/engineer'].some(p => pathnameRef.current.startsWith(p))) return;
      console.log("[InstallAppBanner] becoming visible", {
        heightBefore: rootRef.current?.offsetHeight ?? null,
      });
      setVisible(true);
      requestAnimationFrame(() => {
        setAnimateIn(true);
        requestAnimationFrame(() => {
          console.log("[InstallAppBanner] visible", {
            heightAfter: rootRef.current?.offsetHeight ?? null,
          });
        });
      });
    }, 3000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
    };
  }, [pathname]);

  const dismiss = useCallback(() => {
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(DISMISSED_KEY, "true");
    }, 300);
  }, []);

  const handleNativeInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") {
      dismiss();
    }
    deferredPrompt.current = null;
    setCanInstallNative(false);
  }, [dismiss]);

  if (['/auth', '/', '/dashboard', '/engineer'].some(p => pathname.startsWith(p))) return null;
  if (!visible) return null;
  if (pathname === "/" || pathname.startsWith("/auth")) return null;

  return (
    <div
      ref={rootRef}
      // Fixed position keeps the banner out of normal flow so the page never shifts.
      // Transform-only entrance (translate + opacity) avoids height/margin reflow.
      // Safe-area padding prevents the iOS dynamic bottom bar from making the
      // card "jump" when the mobile viewport height changes.
      // A stable min-height reserves space so adding the optional native
      // "Install Now" button does not reflow the card itself.
      className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transform-gpu will-change-transform transition-[transform,opacity] duration-300 ease-out ${
        animateIn ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      style={{ minHeight: 168, contain: "layout paint" }}
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
          width={48}
          height={48}
          decoding="async"
          loading="eager"
          className="w-12 h-12 rounded-xl flex-shrink-0 block"
          style={{ aspectRatio: "1 / 1" }}
        />
        <div>
          <p className="font-bold text-foreground text-sm">Install BookedJobs</p>
          <p className="text-xs text-muted-foreground">
            Add to your home screen for quick access
          </p>
        </div>
      </div>

      {/* Instructions — reserve a fixed row height so the platform-specific
          message swap never resizes the card. */}
      <div className="mt-3 min-h-[20px] flex items-center">
        {isAndroid ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span>Tap the menu ⋮ then "Add to Home Screen"</span>
          </div>
        ) : isIOS ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Share2 className="w-4 h-4 flex-shrink-0" />
            <span>Tap Share then "Add to Home Screen"</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span>Use your browser menu to add to home screen</span>
          </div>
        )}
      </div>

      {/* Native install button slot — always reserved on Android so the late
          `beforeinstallprompt` event never grows the card after it appears. */}
      {isAndroid && (
        <div className="mt-3 h-10">
          {canInstallNative && (
            <Button
              onClick={handleNativeInstall}
              className="w-full h-10 text-white"
              style={{ backgroundColor: "#4A86E8" }}
            >
              Install Now
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// memo prevents re-renders when parent layouts update with unrelated state,
// so the fixed banner never remounts or shifts after first paint.
const InstallAppBanner = memo(InstallAppBannerInner);

export default InstallAppBanner;
