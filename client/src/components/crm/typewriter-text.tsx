import { useEffect, useRef, useState } from "react";

/** Reveals text progressively, like a live model stream — a fresh Gibbs
 *  answer flows in word by word instead of appearing as a wall of text.
 *  Restored/older messages render instantly (animate=false). */
export function TypewriterText({
  text,
  animate,
  onProgress,
  onComplete,
}: {
  text: string;
  animate: boolean;
  onProgress?: () => void;
  /** Fired once when an animated reveal reaches the end — lets the parent
   *  hold back follow-up UI (approval cards, chips) until Gibbs "finishes
   *  talking". Not fired for instantly-rendered messages. */
  onComplete?: () => void;
}) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const doneRef = useRef(!animate);

  useEffect(() => {
    if (!animate || doneRef.current) {
      setShown(text.length);
      return;
    }
    setShown(0);
    // ~2.5s for a typical answer regardless of length: bigger steps for
    // longer text, minimum a couple of characters per frame.
    const step = Math.max(2, Math.ceil(text.length / 150));
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(text.length, current + step);
      setShown(current);
      if (current % (step * 8) < step) onProgress?.();
      if (current >= text.length) {
        doneRef.current = true;
        clearInterval(id);
        onProgress?.();
        onComplete?.();
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate]);

  return (
    <>
      {text.slice(0, shown)}
      {shown < text.length && (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse rounded-sm bg-current align-baseline" />
      )}
    </>
  );
}
