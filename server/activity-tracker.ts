const DEFAULT_IDLE_THRESHOLD_MS = 15 * 60 * 1000;

let lastActivityAt: number = 0;
let onBecomeActiveCallbacks: Array<() => void> = [];

export function recordUserActivity(): void {
  const wasIdle = !isAppActive();
  lastActivityAt = Date.now();

  if (wasIdle && onBecomeActiveCallbacks.length > 0) {
    const callbacks = onBecomeActiveCallbacks.splice(0);
    for (const cb of callbacks) {
      try {
        cb();
      } catch (err) {
        console.error("[ActivityTracker] onBecomeActive callback error:", err);
      }
    }
  }
}

export function isAppActive(thresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS): boolean {
  if (lastActivityAt === 0) return false;
  return Date.now() - lastActivityAt < thresholdMs;
}

export function onBecomeActive(callback: () => void): void {
  onBecomeActiveCallbacks.push(callback);
}
