"use client";

import { useEffect, useRef, useMemo } from "react";
import { useAnimate, type Transition } from "framer-motion";

const TAGS = ["h1", "h2", "h3", "p", "div"] as const;

export interface ZoomTextTunnelProps {
  texts?: string[];
  suffixes?: (React.ReactNode | null)[];
  font?: React.CSSProperties;
  color?: string;
  tag?: (typeof TAGS)[number];
  maxScale?: number;
  hold?: number;
  transition?: Transition;
  style?: React.CSSProperties;
  scrollTriggered?: boolean;
  progress?: number;
}

export default function ZoomTextTunnel(props: ZoomTextTunnelProps) {
  const {
    texts = ["EXPLORE", "CREATE", "INNOVATE", "FUTURE"],
    suffixes,
    font = {
      fontFamily: "Inter",
      fontWeight: 400,
      fontSize: 120,
      lineHeight: "1em",
      letterSpacing: "-0.02em",
      textAlign: "center",
    },
    color = "#FFFFFF",
    tag = "h2",
    maxScale = 35,
    hold = 600,
    transition = {
      type: "tween",
      stiffness: 800,
      damping: 60,
      mass: 1,
      duration: 1.2,
      ease: [0.7, 0, 0.25, 1],
    },
    style,
    scrollTriggered = false,
    progress = 0,
  } = props;

  const [scope, animate] = useAnimate();
  const slot0Ref = useRef<HTMLSpanElement>(null);
  const slot1Ref = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsRef = useRef<any[]>([]);

  const safeTexts = useMemo(() => {
    const cleaned = Array.isArray(texts)
      ? texts.filter((t) => typeof t === "string" && t.length > 0)
      : [];
    return cleaned.length > 0 ? cleaned : ["ZOOM"];
  }, [texts]);

  const clampedMaxScale = useMemo(() => {
    const n = Number(maxScale);
    return Number.isFinite(n) ? Math.max(1, n) : 35;
  }, [maxScale]);

  const holdMs = useMemo(() => {
    const n = Number(hold);
    return Number.isFinite(n) ? Math.max(0, n) : 600;
  }, [hold]);

  const longest = useMemo(
    () => safeTexts.reduce((a, b) => (b.length > a.length ? b : a), safeTexts[0]),
    [safeTexts]
  );

  useEffect(() => {
    if (scrollTriggered) return;

    const slots = [slot0Ref.current, slot1Ref.current];
    const sel = [".slot-0", ".slot-1"];

    if (safeTexts.length <= 1) {
      if (slots[0]) slots[0].textContent = safeTexts[0];
      animate(sel[0], { scale: 1, opacity: 1 }, { duration: 0 });
      animate(sel[1], { scale: 0.05, opacity: 0 }, { duration: 0 });
      return;
    }

    let cancelled = false;
    let active = 0;
    let idx = 0;

    if (slots[0]) slots[0].textContent = safeTexts[0];
    animate(sel[0], { scale: 1, opacity: 1 }, { duration: 0 });
    animate(sel[1], { scale: 0.05, opacity: 0 }, { duration: 0 });

    const wait = (ms: number) =>
      new Promise<void>((res) => {
        timeoutRef.current = setTimeout(res, ms);
      });
    const settle = (c: any) => (c && c.finished ? c.finished : Promise.resolve());

    const run = async () => {
      while (!cancelled) {
        await wait(holdMs);
        if (cancelled) return;

        const inc = 1 - active;
        const nextIdx = (idx + 1) % safeTexts.length;
        if (slots[inc]) slots[inc].textContent = safeTexts[nextIdx];

        await settle(animate(sel[inc], { scale: 0.05, opacity: 0 }, { duration: 0 }));
        if (cancelled) return;

        const enter = animate(sel[inc], { scale: 1, opacity: 1 }, transition);
        const exit = animate(sel[active], { scale: clampedMaxScale, opacity: 0 }, transition);
        controlsRef.current = [enter, exit];

        await settle(exit);
        if (cancelled) return;

        await settle(animate(sel[active], { scale: 0.05, opacity: 0 }, { duration: 0 }));
        active = inc;
        idx = nextIdx;
      }
    };
    run();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      controlsRef.current.forEach((c) => c && c.stop && c.stop());
    };
  }, [safeTexts, transition, clampedMaxScale, holdMs, animate, scrollTriggered]);

  const fontStyles = font;
  const safeTag = (TAGS as readonly string[]).includes(tag) ? tag : "h2";
  const Tag = safeTag as any;

  const srOnly: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  };

  const slotStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "pre",
    color,
    transformOrigin: "center center",
    willChange: "transform, opacity",
    ...fontStyles,
  };

  const renderedPassages = useMemo(() => {
    if (!scrollTriggered) return null;

    const count = safeTexts.length;
    const clampedP = Math.max(0, Math.min(1, progress));

    // Each text occupies an equal slice of [0, 1], with a small overlap
    // for smooth cross-fades. Timing per text:
    //   entrance  : 0% → 20% of the slot  (scale 0.08 → 1, opacity 0 → 1)
    //   hold      : 20% → 55% of the slot  (scale 1 → 1.15, opacity 1)
    //   exit      : 55% → 100% of the slot (scale 1.15 → maxScale, opacity fades OUT by 75%)
    // The key change: opacity goes to 0 well before scale gets enormous, killing the grey bleed.
    return safeTexts.map((text, i) => {
      const slotSize = 1 / count;
      // Small overlap: start a little before the slot to allow cross-fade
      const slotStart = i === 0 ? 0 : Math.max(0, i * slotSize - slotSize * 0.05);
      const slotEnd = i === count - 1 ? 1 : Math.min(1, (i + 1) * slotSize + slotSize * 0.05);

      let scale: number;
      let opacity: number;

      if (clampedP < slotStart) {
        // Not yet — microscopic and invisible
        scale = 0.08;
        opacity = 0;
      } else if (clampedP > slotEnd) {
        // Already exited — keep invisible (don't render at huge scale)
        scale = 1;
        opacity = 0;
      } else {
        const localT = (clampedP - slotStart) / (slotEnd - slotStart);

        if (localT < 0.2) {
          // Entrance: zoom in from tiny, fade in
          const t = localT / 0.2;
          const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
          scale = 0.08 + 0.92 * eased;
          opacity = eased;
        } else if (localT < 0.55) {
          // Hold: slight continued grow
          const t = (localT - 0.2) / 0.35;
          scale = 1.0 + 0.15 * t;
          opacity = 1;
        } else {
          // Exit: fade out sharply then accelerate scale
          const t = (localT - 0.55) / 0.45;
          const fadeT = Math.min(1, t / 0.45); // opacity gone by 45% into exit
          opacity = Math.max(0, 1 - Math.pow(fadeT, 1.8));
          scale = 1.15 + (clampedMaxScale - 1.15) * Math.pow(t, 2.5);
        }
      }

      const isHighlight = text.toUpperCase() === "HYMERIOUS";

      return {
        text,
        style: {
          ...slotStyle,
          transform: `scale(${scale.toFixed(4)})`,
          opacity: opacity.toFixed(4),
          filter: isHighlight
            ? `drop-shadow(0 0 ${45 + opacity * 20}px rgba(34,211,238,${(opacity * 0.9).toFixed(2)}))`
            : undefined,
          transition: "none",
        },
      };
    });
  }, [scrollTriggered, safeTexts, progress, clampedMaxScale, slotStyle]);

  return (
    <div
      ref={scope}
      aria-label={safeTexts.join(", ")}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        minWidth: 1,
        minHeight: 1,
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      <Tag style={srOnly}>{safeTexts.join(", ")}</Tag>

      <span
        aria-hidden="true"
        style={{
          visibility: "hidden",
          whiteSpace: "pre",
          color,
          ...fontStyles,
        }}
      >
        {longest}
      </span>

      {!scrollTriggered ? (
        <>
          <span ref={slot0Ref} className="slot-0" aria-hidden="true" style={slotStyle} />
          <span ref={slot1Ref} className="slot-1" aria-hidden="true" style={slotStyle} />
        </>
      ) : (
        renderedPassages?.map((item, idx) => (
          <span key={idx} aria-hidden="true" style={item.style}>
            {item.text}
            {suffixes?.[idx] ?? null}
          </span>
        ))
      )}
    </div>
  );
}