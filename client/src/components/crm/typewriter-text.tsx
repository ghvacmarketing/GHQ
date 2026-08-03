import { useEffect, useMemo, useRef, useState } from "react";

/** Reveals text like a live model stream — each word of a fresh Gibbs answer
 *  fades in from a slight blur (the ChatGPT/Gemini feel) instead of typing
 *  character by character. Whitespace tokens (including newlines) pass
 *  through as raw text so pre-wrap layout is untouched, and paragraph breaks
 *  read as natural little pauses. Once the reveal finishes the component
 *  settles to a single plain text node. Restored/older messages render
 *  instantly (animate=false).
 *
 *  streaming=true means `text` is still GROWING (live deltas from the
 *  model): the reveal chases the incoming tail without restarting, speeds up
 *  when it falls behind, idles when it catches up, and onComplete is held
 *  until the parent flips streaming off. */
export function TypewriterText({
  text,
  animate,
  streaming = false,
  onProgress,
  onComplete,
}: {
  text: string;
  animate: boolean;
  streaming?: boolean;
  onProgress?: () => void;
  /** Fired once when an animated reveal reaches the end — lets the parent
   *  hold back follow-up UI (approval cards, chips) until Gibbs "finishes
   *  talking". Not fired for instantly-rendered messages. */
  onComplete?: () => void;
}) {
  // Words and whitespace runs, in order — joining tokens reproduces `text`
  // exactly, so nothing about wrapping or blank lines changes.
  const tokens = useMemo(() => text.split(/(\s+)/).filter(Boolean), [text]);
  const [shown, setShown] = useState(animate ? 0 : Number.MAX_SAFE_INTEGER);
  const shownRef = useRef(animate ? 0 : Number.MAX_SAFE_INTEGER);
  const doneRef = useRef(!animate);

  useEffect(() => {
    if (!animate || doneRef.current) {
      shownRef.current = Number.MAX_SAFE_INTEGER;
      setShown(Number.MAX_SAFE_INTEGER);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const total = tokens.length;
    // ~3s for a typical settled answer, clamped so short replies don't snap
    // and long ones don't drone.
    const base = Math.min(64, Math.max(16, 2800 / Math.max(1, total)));
    const step = () => {
      if (cancelled) return;
      if (shownRef.current < total) {
        shownRef.current += 1;
        setShown(shownRef.current);
        if (shownRef.current % 6 === 0) onProgress?.();
        if (shownRef.current >= total && !streaming) {
          doneRef.current = true;
          onProgress?.();
          onComplete?.();
          return;
        }
        // Jittered cadence reads as generation, not a metronome; when the
        // stream runs ahead, shrink the interval to close the gap.
        const backlog = total - shownRef.current;
        const pace = base / (1 + backlog / 12);
        timer = setTimeout(step, pace * (0.6 + Math.random() * 0.8));
      } else if (streaming) {
        // Caught up to the live edge — idle until more text lands (the
        // effect restarts on growth, but poll as a safety net).
        timer = setTimeout(step, 90);
      } else {
        doneRef.current = true;
        onProgress?.();
        onComplete?.();
      }
    };
    timer = setTimeout(step, Math.min(base, 24));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.length, animate, streaming]);

  // Settled: collapse the word spans back into one cheap text node.
  if (shown >= tokens.length && !streaming) return <>{text}</>;

  return (
    <>
      {tokens.slice(0, Math.min(shown, tokens.length)).map((t, i) =>
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
