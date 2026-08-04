/** One-shot entrance suppression for swipe-back navigation.
 *
 *  The tracked back-swipe reveals the REAL destination page as an underlay at
 *  full opacity — then navigation remounts that same page, and MobileShell's
 *  mount fade (animate-in fade-in) made it blink out and fade back: the
 *  "flash" after a swipe. Pages that are about to navigate as the tail end of
 *  a swipe call markSkipEntrance(); the shell checks skipEntranceOnce() on
 *  mount and renders that one arrival with no entrance animation. */

let cachedUntil = 0;
let cachedVal = false;

export function markSkipEntrance(): void {
  // A swipe PRE-MOUNTS the destination as its underlay, whose shell reads
  // skipEntranceOnce() → false and caches that answer. Without busting the
  // cache here, a quick flick's real arrival (within the cache window) read
  // the stale "false" and played the mount fade anyway — the post-swipe
  // flash on fast swipes.
  cachedUntil = 0;
  try {
    sessionStorage.setItem("ghq-skip-entrance", String(Date.now()));
  } catch {
    /* storage unavailable — the fade just plays */
  }
}

/** True exactly once per mark (cached briefly so several components mounting
 *  in the same navigation can all read the same answer). */
export function skipEntranceOnce(): boolean {
  const now = Date.now();
  if (now < cachedUntil) return cachedVal;
  let v = false;
  try {
    const t = Number(sessionStorage.getItem("ghq-skip-entrance") || 0);
    if (t && now - t < 1200) {
      v = true;
      sessionStorage.removeItem("ghq-skip-entrance");
    }
  } catch {
    /* storage unavailable */
  }
  cachedVal = v;
  cachedUntil = now + 400;
  return v;
}
