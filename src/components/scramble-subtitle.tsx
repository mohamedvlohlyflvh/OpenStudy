"use client";

import { useEffect, useState } from "react";
import GlitchCharReveal from "@/components/originkit/ui/scrambletext";
import { useAppStore } from "@/lib/store";

/**
 * Kinetic scramble subtitle built on Originkit GlitchCharReveal.
 * - tag="div" (mandatory — ghost measurers break <p>/<h*> tags)
 * - restState "solid" + replay false → plays once on scroll-in, no layout shift
 * - flicker/hover disabled (long-text loop hazards per originkit skill)
 * - Reduced motion (app pref OR OS) → static text, same styling.
 */
export function ScrambleSubtitle({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const reducedMotionPref = useAppStore((s) => s.reducedMotion);
  const [osReduced, setOsReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const reduced = reducedMotionPref || osReduced;

  if (reduced) {
    return (
      <p className={className} aria-label={text}>
        {text}
      </p>
    );
  }

  return (
    <div className={className} aria-label={text}>
      <GlitchCharReveal
        words={text}
        tag="div"
        color="var(--color-fg)"
        font={{
          fontSize: "inherit",
          lineHeight: "inherit",
          fontWeight: "inherit",
          letterSpacing: "inherit",
        }}
        enterAnimation={{
          mode: "oneLine",
          position: "above",
          restState: "solid",
          replay: false,
          flickerEnabled: false,
          ease: { duration: 0.9 },
        }}
        hoverAnimation={{ type: "none" }}
      />
    </div>
  );
}
