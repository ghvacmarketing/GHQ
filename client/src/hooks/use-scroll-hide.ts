import { useEffect, useState } from "react";

/** Uber-style chrome hiding: returns true while the user is scrolling down
 *  the shell's main scroller, false the moment they scroll back up a little
 *  (or reach the top). Drive a translate/fade off it. */
export function useScrollHide(threshold = 14) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const main = document.querySelector('[data-testid="mobile-main"]');
    if (!main) return;
    let lastY = main.scrollTop;
    let acc = 0;
    const onScroll = () => {
      const y = main.scrollTop;
      const dy = y - lastY;
      lastY = y;
      if (y <= 0) {
        acc = 0;
        setHidden(false);
        return;
      }
      // Direction flip resets the accumulator so a small counter-scroll acts fast
      if ((dy > 0) !== (acc > 0)) acc = 0;
      acc += dy;
      if (acc > threshold) setHidden(true);
      else if (acc < -threshold) setHidden(false);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}
