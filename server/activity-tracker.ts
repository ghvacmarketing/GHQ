const DEFAULT_IDLE_THRESHOLD_MS = 15 * 60 * 1000;

let lastActivityAt: number = 0;
let wasActive: boolean = false;
let onBecomeActiveCallbacks: Array<() => void> = [];

export function recordUserActivity(): void {
  const nowWasActive = isAppActive();
  lastActivityAt = Date.now();

  if (!nowWasActive) {
    const callbacks = onBecomeActiveCallbacks.slice();
    onBecomeActiveCallbacks = [];
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
  if (isAppActive()) {
    callback();
    return;
  }
  onBecomeActiveCallbacks.push(callback);
}
