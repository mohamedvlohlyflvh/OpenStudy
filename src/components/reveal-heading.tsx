"use client";

import { useEffect, useState } from "react";
import LineMaskSplit from "@/components/originkit/ui/scroll-text-reveal";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

/**
 * Animated page heading using Originkit LineMaskSplit (scroll-text-reveal).
 * Falls back to a static <h1> when motion is reduced — either via the app's
 * "Reduced Motion" setting OR the OS prefers-reduced-motion media query.
 * The animated variant is driven by framer-motion/GSAP (JS), so it is NOT
 * stopped by the CSS animation-duration override; we must skip it entirely.
 * One unified entrance — no stagger — per design taste.
 */
export function RevealHeading({
  text,
  className,
  color,
  tag = "h1",
}: {
  text: string;
  className?: string;
  color?: string;
  tag?: "h1" | "h2";
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
  const Tag = tag;

  if (reduced) {
    return (
      <Tag
        className={cn("uppercase tracking-tighter", className)}
        style={color ? { color } : undefined}
      >
        {text}
      </Tag>
    );
  }

  return (
    <LineMaskSplit
      text={text}
      tag={tag}
      color={color ?? "var(--color-fg)"}
      splitMode="chars"
      blurEnabled={true}
      blurIntensity={12}
      translateYInitial={80}
      scrollTriggerPosition="bottom"
      font={{
        fontFamily: "var(--font-display)",
        fontSize: "clamp(3rem, 8vw, 6rem)",
        fontWeight: 700,
        lineHeight: "1.0",
        letterSpacing: "-0.04em",
        textAlign: "left",
      }}
      className={cn("uppercase tracking-tighter", className)}
    />
  );
}
