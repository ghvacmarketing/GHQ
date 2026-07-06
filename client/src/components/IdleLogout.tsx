import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

// Auto-logout after a period of no user interaction. Guards customer PII,
// financial, and payroll data on shared/field devices. Active users are never
// interrupted; only a genuinely idle session is ended.
const DEFAULT_IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity
const DEFAULT_WARNING_MS = 60 * 1000; // show the countdown for the final 60s
const ACTIVITY_THROTTLE_MS = 1000; // re-arm at most once per second

// Public / customer-facing routes where staff idle-logout must NOT run
// (mirrors the gate's public list so we never disrupt public viewers).
const PUBLIC_PATTERNS: RegExp[] = [
  /^\/quote\/[^/]+$/,
  /^\/q\//,
  /^\/i\//,
  /^\/sign\//,
  /^\/portal(\/|$)/,
  /^\/book-online/,
  /^\/book$/,
  /^\/auth-verify/,
  /^\/salesbook/,
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

export default function IdleLogout({
  idleMs = DEFAULT_IDLE_MS,
  warningMs = DEFAULT_WARNING_MS,
}: {
  idleMs?: number;
  warningMs?: number;
}) {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(warningMs / 1000));

  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivity = useRef(0);
  const loggingOut = useRef(false);

  const clearTimers = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    warnTimer.current = null;
    logoutTimer.current = null;
    countdownTimer.current = null;
  }, []);

  const doLogout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    clearTimers();
    // Best-effort: end every staff session type on the server.
    for (const url of ["/api/auth/logout", "/api/crm/auth/logout", "/api/employee-portal/logout"]) {
      try {
        await apiRequest("POST", url);
      } catch {
        /* ignore — logout is best-effort */
      }
    }
    try {
      localStorage.removeItem("ghvac-global-auth");
      localStorage.removeItem("adminToken");
    } catch {
      /* ignore */
    }
    // Full reload so every gate/guard re-evaluates from a clean state.
    window.location.href = "/";
  }, [clearTimers]);

  const arm = useCallback(() => {
    clearTimers();
    setWarning(false);
    // Don't arm on public/customer pages.
    if (isPublicPath(window.location.pathname)) return;
    warnTimer.current = setTimeout(() => {
      setWarning(true);
      setSecondsLeft(Math.floor(warningMs / 1000));
      countdownTimer.current = setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
    }, Math.max(0, idleMs - warningMs));
    logoutTimer.current = setTimeout(doLogout, idleMs);
  }, [clearTimers, doLogout, idleMs, warningMs]);

  useEffect(() => {
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity.current < ACTIVITY_THROTTLE_MS) return;
      lastActivity.current = now;
      arm();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimers();
    };
  }, [arm, clearTimers]);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Are you still there?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You've been inactive for a while. For security, you'll be logged out in{" "}
          <span className="font-semibold text-foreground">{secondsLeft}s</span>.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => doLogout()}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Log out now
          </button>
          <button
            type="button"
            onClick={() => arm()}
            autoFocus
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
}
