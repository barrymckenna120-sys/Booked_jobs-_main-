import { useEffect, useState } from "react";
import { Volume2, X } from "lucide-react";
import { isAudioUnlocked, unlockAudioNow, playDoubleBeep } from "@/utils/audio";
import { toast } from "sonner";

/**
 * Floating "Enable Sound Alerts" prompt shown until the user explicitly
 * unlocks audio. Required so iOS Safari / Android Chrome allow notification
 * sounds triggered later from Realtime events.
 */
const EnableSoundBanner = () => {
  const [unlocked, setUnlocked] = useState<boolean>(() => isAudioUnlocked());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Re-check on mount in case another tab unlocked
  useEffect(() => {
    setUnlocked(isAudioUnlocked());
  }, []);

  if (unlocked || dismissed) return null;

  const handleEnable = async () => {
    setBusy(true);
    const res = await unlockAudioNow();
    setBusy(false);
    if (res.ok) {
      setUnlocked(true);
      // Audible confirmation so the user knows it worked.
      const beep = await playDoubleBeep();
      if (beep.played) {
        toast.success("Sound alerts enabled");
      } else {
        toast.warning("Audio unlocked, but test sound was blocked", {
          description: `AudioContext: ${beep.state}`,
        });
      }
    } else {
      toast.error("Could not enable sound", {
        description: `Reason: ${res.reason ?? "unknown"} (state: ${res.state})`,
      });
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 w-[min(92vw,420px)] rounded-2xl border border-border bg-background shadow-xl p-3 flex items-center gap-3"
      role="status"
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Volume2 className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">Enable sound alerts</p>
        <p className="text-xs text-muted-foreground leading-tight">
          Tap to hear new job notifications.
        </p>
      </div>
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="px-3 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 min-h-[40px]"
      >
        {busy ? "Enabling…" : "Enable"}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="p-2 text-muted-foreground hover:text-foreground min-h-[40px] min-w-[40px] flex items-center justify-center"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default EnableSoundBanner;
