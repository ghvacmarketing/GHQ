// Storage-proof reload guard for auto-recovery reloads.
//
// Every "reload to fix it" mechanism needs a loop breaker, and a counter in
// local/session storage is NOT one on a device whose webview storage is
// wedged (iOS WKWebView storage wedges are a documented failure mode here —
// writes silently no-op, so the counter never advances and the app reloads
// itself forever, about once a second). The attempt count therefore rides in
// the URL itself: a reload carries `?<key>=N` forward, which survives with no
// working storage at all.

/** Attempts already consumed for this guard key (0 when never reloaded). */
export function reloadGuardAttempts(key: string): number {
  try {
    return Number(new URL(window.location.href).searchParams.get(key) || "0") || 0;
  } catch {
    return 0;
  }
}

/** Reload the page with the guard counter advanced. Returns false — WITHOUT
 *  reloading — once maxAttempts is spent, so callers can stop and degrade
 *  gracefully instead of looping. */
export function guardedReload(key: string, maxAttempts = 2): boolean {
  try {
    const url = new URL(window.location.href);
    const attempts = Number(url.searchParams.get(key) || "0") || 0;
    if (attempts >= maxAttempts) return false;
    url.searchParams.set(key, String(attempts + 1));
    window.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

/** Drop the guard counter from the URL after a healthy boot, so a LATER
 *  failure gets its own fresh attempts. */
export function clearReloadGuard(key: string): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {}
}
