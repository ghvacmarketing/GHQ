const DEFAULT_IDLE_THRESHOLD_MS = 15 * 60 * 1000;

let lastActivityAt: number = 0;
const activationListeners: Set<() => void> = new Set();

export function recordUserActivity(): void {
  const wasIdle = !isAppActive();
  lastActivityAt = Date.now();

  if (wasIdle) {
    for (const listener of activationListeners) {
      try {
        listener();
      } catch (err) {
        console.error("[ActivityTracker] activation listener error:", err);
      }
    }
  }
}

export function isAppActive(thresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS): boolean {
  if (lastActivityAt === 0) return false;
  return Date.now() - lastActivityAt < thresholdMs;
}

export function onBecomeActive(callback: () => void): () => void {
  activationListeners.add(callback);
  return () => activationListeners.delete(callback);
}
