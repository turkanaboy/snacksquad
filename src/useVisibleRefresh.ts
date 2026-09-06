import { useEffect, useRef } from "react";

/** Refresh mounted shared views while visible; callers own error handling. */
export function useVisibleRefresh(refresh: () => Promise<void>, enabled = true, intervalMs = 30_000) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = false;
    const run = async () => {
      if (!active || pending || document.visibilityState !== "visible") return;
      pending = true;
      try { await latest.current(); } finally { pending = false; }
    };
    const visible = () => { void run(); };
    const timer = window.setInterval(visible, intervalMs);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, intervalMs]);
}
