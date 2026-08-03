import { useEffect, useMemo, useRef, useState } from "react";

/** Reveals text like a live model stream — each word of a fresh Gibbs answer
 *  fades in from a slight blur (the ChatGPT/Gemini feel) instead of typing
 *  character by character. Whitespace tokens (including newlines) pass
 *  through as raw text so pre-wrap layout is untouched, and paragraph breaks
 *  read as natural little pauses. Once the reveal finishes the component
 *  settles to a single plain text node. Restored/older messages render
 *  instantly (animate=false). */
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
  // Words and whitespace runs, in order — joining tokens reproduces `text`
  // exactly, so nothing about wrapping or blank lines changes.
  const tokens = useMemo(() => text.split(/(\s+)/).filter(Boolean), [text]);
  const [shown, setShown] = useState(animate ? 0 : tokens.length);
  const doneRef = useRef(!animate);

  useEffect(() => {
    if (!animate || doneRef.current) {
      setShown(tokens.length);
      return;
    }
    setShown(0);
    // ~3s for a typical answer regardless of length, clamped so short
    // replies don't snap and long ones don't drone.
    const base = Math.min(64, Math.max(16, 2800 / Math.max(1, tokens.length)));
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      current = Math.min(tokens.length, current + 1);
      setShown(current);
      if (current % 6 === 0) onProgress?.();
      if (current >= tokens.length) {
        doneRef.current = true;
        onProgress?.();
        onComplete?.();
        return;
      }
      // Jittered cadence reads as generation, not a metronome.
      timer = setTimeout(tick, base * (0.6 + Math.random() * 0.8));
    };
    timer = setTimeout(tick, base);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate]);

  // Settled: collapse the word spans back into one cheap text node.
  if (shown >= tokens.length) return <>{text}</>;

  return (
    <>
      {tokens.slice(0, shown).map((t, i) =>
        /\S/.test(t) ? (
          <span key={i} className="gibbs-word-in">
            {t}
          </span>
        ) : (
          t
        ),
      )}
    </>
  );
}
