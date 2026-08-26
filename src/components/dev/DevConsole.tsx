import { useEffect, useRef, useState } from "react";

type Level = "log" | "warn" | "error";
type Entry = { ts: string; level: Level; msg: string };

const MAX_ENTRIES = 500;

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(" ");
}

const DevConsole = () => {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("bj_dev_console") === "true") {
        setEnabled(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const orig = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    const push = (level: Level, args: unknown[]) => {
      const entry: Entry = {
        ts: new Date().toISOString().slice(11, 23),
        level,
        msg: format(args),
      };
      setEntries((prev) => {
        const next = prev.length >= MAX_ENTRIES ? prev.slice(-MAX_ENTRIES + 1) : prev.slice();
        next.push(entry);
        return next;
      });
    };

    console.log = (...args: unknown[]) => { push("log", args); orig.log(...args); };
    console.warn = (...args: unknown[]) => { push("warn", args); orig.warn(...args); };
    console.error = (...args: unknown[]) => { push("error", args); orig.error(...args); };

    const onRejection = (e: PromiseRejectionEvent) => {
      push("error", ["[unhandledrejection]", e.reason]);
    };
    const onError = (e: ErrorEvent) => {
      push("error", ["[error]", e.message, e.filename + ":" + e.lineno]);
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);

    return () => {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, [enabled]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  if (!enabled) return null;

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          zIndex: 2147483647,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          border: "1px solid #444",
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 11,
          fontFamily: "monospace",
        }}
      >
        Dev ({entries.length})
      </button>
    );
  }

  const copy = async () => {
    const text = entries.map((e) => `[${e.ts}] ${e.level.toUpperCase()} ${e.msg}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  const colorFor = (l: Level) => (l === "error" ? "#ff6b6b" : l === "warn" ? "#ffd93d" : "#ffffff");

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "40vh",
        background: "rgba(10,10,10,0.92)",
        color: "#fff",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        zIndex: 2147483647,
        borderTop: "1px solid #333",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          borderBottom: "1px solid #333",
          background: "rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ opacity: 0.8 }}>Dev Console — {entries.length} entries</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={copy}
            style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
          >
            Copy
          </button>
          <button
            onClick={() => setEntries([])}
            style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
          >
            Clear
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div ref={scrollRef} style={{ overflowY: "auto", padding: "4px 8px", flex: 1 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ color: colorFor(e.level), whiteSpace: "pre-wrap", wordBreak: "break-word", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "2px 0" }}>
            <span style={{ opacity: 0.6 }}>[{e.ts}]</span>{" "}
            <span style={{ opacity: 0.8 }}>{e.level.toUpperCase()}</span>{" "}
            {e.msg}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DevConsole;
