"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { useAppStore } from "@/lib/store";

/**
 * CountUp — 21st.dev-style animated number.
 * Counts from 0 to `value` with an easeOutExpo curve when scrolled into view.
 * Non-numeric values (e.g. "1m 20s") render statically. Honors the app's
 * reduced-motion preference AND the OS setting — no animation either way.
 */
export function CountUp({
  value,
  duration = 700,
  className,
}: {
  value: number | string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
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
  const animate = typeof value === "number" && inView && !reduced;

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let start: number | null = null;
    const target = value as number;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setDisplay(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, value, duration]);

  const shown =
    typeof value !== "number"
      ? value
      : animate
        ? Math.round(display).toLocaleString("en-US")
        : value.toLocaleString("en-US");

  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
}
