import { useEffect, useRef, useState } from "react";

/**
 * Smooths a loading flag so skeletons never flash:
 * - Skeletons only become VISIBLE after ~250ms (CSS `.skeleton-shimmer` delay),
 *   so loads faster than that show nothing — this hook passes those through.
 * - If the skeleton did become visible, keep reporting `loading` until it has
 *   been on screen for at least `minShowMs`, even if the data arrived sooner.
 */
export function useSmoothLoading(loading: boolean, appearAfterMs = 250, minShowMs = 350): boolean {
  const [smoothed, setSmoothed] = useState(loading);
  const startedAtRef = useRef<number | null>(loading ? Date.now() : null);

  useEffect(() => {
    let timer: number | undefined;
    if (loading) {
      if (startedAtRef.current === null) startedAtRef.current = Date.now();
      setSmoothed(true);
    } else {
      const startedAt = startedAtRef.current;
      startedAtRef.current = null;
      const elapsed = startedAt === null ? Infinity : Date.now() - startedAt;
      if (elapsed <= appearAfterMs || elapsed >= appearAfterMs + minShowMs) {
        // Never became visible, or has been visible long enough — release now.
        setSmoothed(false);
      } else {
        timer = window.setTimeout(() => setSmoothed(false), appearAfterMs + minShowMs - elapsed);
      }
    }
    return () => window.clearTimeout(timer);
  }, [loading, appearAfterMs, minShowMs]);

  return loading || smoothed;
}
