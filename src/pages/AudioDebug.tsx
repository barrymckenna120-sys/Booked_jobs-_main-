import { useEffect, useState } from "react";
import { getDebugLogs, clearDebugLogs, debugLog, type DebugEntry } from "@/utils/debugLog";
import { playEngineerMessageAlert, unlockAudio } from "@/utils/audio";

const AudioDebug = () => {
  const [entries, setEntries] = useState<DebugEntry[]>(getDebugLogs());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    unlockAudio();
    const refresh = () => setEntries(getDebugLogs());
    window.addEventListener("audio-debug-log", refresh);
    window.addEventListener("audio-debug-cleared", refresh);
    const i = setInterval(refresh, 1000);
    return () => {
      window.removeEventListener("audio-debug-log", refresh);
      window.removeEventListener("audio-debug-cleared", refresh);
      clearInterval(i);
    };
  }, []);

  const text = entries.map((e) => `[${e.ts}] ${e.msg}`).join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select textarea
      const ta = document.getElementById("logs-ta") as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand?.("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audio-debug-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleTest = () => {
    debugLog("Manual test tap");
    playEngineerMessageAlert();
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-[600px] mx-auto">
      <h1 className="text-xl font-bold mb-3 text-foreground">Audio Debug</h1>
      <div className="text-sm text-muted-foreground mb-3">
        {entries.length} log entr{entries.length === 1 ? "y" : "ies"}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={handleTest}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold min-h-[44px]"
        >
          Test Sound
        </button>
        <button
          onClick={handleCopy}
          className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold min-h-[44px]"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={handleDownload}
          className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold min-h-[44px]"
        >
          Download
        </button>
        <button
          onClick={() => { clearDebugLogs(); setEntries([]); }}
          className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-semibold min-h-[44px]"
        >
          Clear
        </button>
      </div>

      <textarea
        id="logs-ta"
        readOnly
        value={text}
        className="w-full h-[60vh] font-mono text-xs p-3 rounded-lg border border-border bg-card text-foreground"
      />
    </div>
  );
};

export default AudioDebug;
