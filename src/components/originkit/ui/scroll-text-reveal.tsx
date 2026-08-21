"use client";

import React, { useRef, useEffect, useState } from "react";
import { animate } from "framer-motion";
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(SplitText, ScrollTrigger);

interface FontConfig {
  fontFamily?: string;
  fontSize?: number | string;
  fontWeight?: string | number;
  fontStyle?: string;
  textDecoration?: string;
  textTransform?: string;
  letterSpacing?: number | string;
  lineHeight?: string | number;
  textAlign?: "left" | "center" | "right" | "justify";
}

interface TransitionConfig {
  type?: "tween" | "spring";
  duration?: number;
  ease?: string;
  delay?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  bounce?: number;
  restDelta?: number;
  restSpeed?: number;
}

interface LineMaskSplitProps {
  text?: string;
  color?: string;
  font?: FontConfig;
  tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div" | "span";
  className?: string;
  style?: React.CSSProperties;
  transition?: TransitionConfig;
  reverse?: boolean;
  scrollTriggerPosition?: "top" | "center" | "bottom";
  splitMode?: "chars" | "words" | "lines";
  blurEnabled?: boolean;
  blurIntensity?: number;
  translateXInitial?: number;
  translateYInitial?: number;
}

export default function LineMaskSplit({
  text = "ANIMATION ON REVEAL",
  color = "#FFFFFF",
  font = {
    fontFamily: "Inter",
    fontSize: 60,
    fontWeight: "700",
    lineHeight: "130%",
    letterSpacing: 0,
    textAlign: "center",
  },
  tag = "h1",
  className = "",
  style = {},
  transition = {
    type: "tween",
    duration: 0.8,
    ease: "easeInOut",
    delay: 0,
  },
  reverse = true,
  scrollTriggerPosition = "bottom",
  splitMode = "chars",
  blurEnabled = true,
  blurIntensity = 20,
  translateXInitial = 0,
  translateYInitial = 100,
}: LineMaskSplitProps) {
  const maskLines = true;
  const opacityInitial = 1;
  const scaleInitial = 1;
  const rotateInitial = 0;
  const blurInitial = blurEnabled ? blurIntensity : 0;
  const textRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationControlsRef = useRef<any[]>([]);
  const hasAnimatedRef = useRef(false);
  const currentLineSplitRef = useRef<any>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstResizeRef = useRef(true);
  const scrollElementsRef = useRef<any[] | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [isOutOfView, setIsOutOfView] = useState(false);
  const TAG = tag;

  const buildTransitionConfig = (transitionValue: TransitionConfig) => {
    const config: any = {};
    if (transitionValue?.type === "spring") {
      config.type = "spring";
      if (transitionValue.stiffness !== undefined)
        config.stiffness = transitionValue.stiffness;
      if (transitionValue.damping !== undefined)
        config.damping = transitionValue.damping;
      if (transitionValue.mass !== undefined)
        config.mass = transitionValue.mass;
      if (transitionValue.bounce !== undefined)
        config.bounce = transitionValue.bounce;
      if (transitionValue.restDelta !== undefined)
        config.restDelta = transitionValue.restDelta;
      if (transitionValue.restSpeed !== undefined)
        config.restSpeed = transitionValue.restSpeed;
    } else {
      config.type = transitionValue?.type || "tween";
      if (transitionValue?.duration !== undefined)
        config.duration = transitionValue.duration;
      if (transitionValue?.ease) config.ease = transitionValue.ease;
    }
    return config;
  };

  const setupSplit = (shouldRevert = false) => {
    if (!textRef.current) return null;
    if (shouldRevert && currentLineSplitRef.current) {
      currentLineSplitRef.current.revert();
      currentLineSplitRef.current = null;
    }
    const lineSplit = SplitText.create(textRef.current, { type: "lines" });
    const lines = lineSplit.lines;
    currentLineSplitRef.current = lineSplit;
    lines.forEach((line: any) => {
      const wrapper = document.createElement("div");
      wrapper.style.overflow = maskLines ? "hidden" : "visible";
      wrapper.style.display = "block";
      line.parentNode?.insertBefore(wrapper, line);
      wrapper.appendChild(line);
    });
    let elements: any[] = [];
    if (splitMode === "chars") {
      lines.forEach((line: any) => {
        const charSplit = SplitText.create(line, {
          type: "chars",
          charsClass: "char",
        });
        elements.push(...charSplit.chars);
      });
    } else if (splitMode === "words") {
      lines.forEach((line: any) => {
        const wordSplit = SplitText.create(line, {
          type: "words",
          wordsClass: "word",
        });
        elements.push(...wordSplit.words);
      });
    } else {
      elements = lines;
    }
    return { lineSplit, elements };
  };

  const animateElements = (elements: any[], forward = true) => {
    animationControlsRef.current.forEach((control) => control.stop());
    animationControlsRef.current = [];
    const transitionConfig = buildTransitionConfig(transition);
    const baseDelay = transition.delay || 0;
    const isTween = transitionConfig.type !== "spring";
    const SPAN: Record<string, number> = {
      lines: 0.6,
      words: 0.45,
      chars: 0.3,
    };
    const total =
      typeof transition.duration === "number" ? transition.duration : 0.8;
    const span = SPAN[splitMode] ?? 0.5;
    const count = Math.max(1, elements.length);
    const perDuration = Math.max(0.05, Math.min(total, total * span));
    const stagger =
      count > 1 ? Math.max(0, (total - perDuration) / (count - 1)) : 0;

    elements.forEach((element: any, index: number) => {
      const elementDelay = baseDelay + index * stagger;
      const clearWillChange = () => {
        element.style.willChange = "auto";
      };
      const onUpdate = (progress: number) => {
        const x = translateXInitial * (1 - progress);
        const y = translateYInitial * (1 - progress);
        const rotation = rotateInitial * (1 - progress);
        const scale = scaleInitial + (1 - scaleInitial) * progress;
        const opacity = opacityInitial + (1 - opacityInitial) * progress;
        const blur = blurInitial * (1 - progress);
        element.style.opacity = opacity.toString();
        /* translate3d forces a GPU layer while the reveal plays. */
        element.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`;
        element.style.filter = `blur(${blur}px)`;
      };
      if (forward) {
        element.style.opacity = opacityInitial.toString();
        element.style.transform = `translate3d(${translateXInitial}px, ${translateYInitial}px, 0) rotate(${rotateInitial}deg) scale(${scaleInitial})`;
        element.style.filter = `blur(${blurInitial}px)`;
        element.style.willChange = "transform, opacity";
        const control = animate(0, 1, {
          ...transitionConfig,
          ...(isTween ? { duration: perDuration } : {}),
          delay: elementDelay,
          onUpdate,
          onComplete: clearWillChange,
        });
        animationControlsRef.current.push(control);
      } else {
        const control = animate(1, 0, {
          ...transitionConfig,
          ...(isTween ? { duration: perDuration } : {}),
          delay: elementDelay,
          onUpdate,
          onComplete: clearWillChange,
        });
        animationControlsRef.current.push(control);
      }
    });
  };

  useEffect(() => {
    if (!textRef.current) return;
    const result = setupSplit();
    if (!result) return;
    const { elements } = result;
    scrollElementsRef.current = elements;
    elements.forEach((el: any) => {
      el.style.opacity = opacityInitial.toString();
      el.style.transform = `translate3d(${translateXInitial}px, ${translateYInitial}px, 0) rotate(${rotateInitial}deg) scale(${scaleInitial})`;
      el.style.filter = `blur(${blurInitial}px)`;
    });
    return () => {
      animationControlsRef.current.forEach((control) => control.stop());
      if (currentLineSplitRef.current) {
        currentLineSplitRef.current.revert();
        currentLineSplitRef.current = null;
      }
      scrollElementsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text,
    splitMode,
    translateXInitial,
    translateYInitial,
    opacityInitial,
    rotateInitial,
    scaleInitial,
    blurInitial,
  ]);

  useEffect(() => {
    let rafId: number | null = null;
    const checkAlignment = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 0;
      const viewportBottom = viewportHeight;
      let elementPoint;
      if (scrollTriggerPosition === "top") {
        elementPoint = rect.top;
      } else if (scrollTriggerPosition === "center") {
        elementPoint = rect.top + rect.height / 2;
      } else {
        elementPoint = rect.bottom;
      }
      const isAligned = elementPoint <= viewportBottom && rect.bottom >= 0;
      setIsInView(isAligned);
      const completelyOutOfView = rect.top > viewportHeight;
      setIsOutOfView(completelyOutOfView);
    };
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkAlignment);
    };
    const handleResize = () => checkAlignment();
    checkAlignment();
    /* LOCAL PATCH: listen on the nearest SCROLLABLE ANCESTOR, not just window.
       Apps that scroll inside a container (e.g. <main class="overflow-y-auto">
       within an h-screen layout) never fire window scroll events — headings
       below the fold then stay frozen in their initial blurred/offset state
       forever. Fall back to window when no scrollable ancestor exists. */
    const getScrollParent = (el: HTMLElement | null): HTMLElement | Window => {
      let node = el ? el.parentElement : null;
      while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          return node;
        }
        node = node.parentElement;
      }
      return window;
    };
    const scrollTarget = getScrollParent(containerRef.current);
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      scrollTarget.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [scrollTriggerPosition]);

  const areElementsInInitialState = (elements: any[]) => {
    if (elements.length === 0) return false;
    const firstEl = elements[0];
    const currentOpacity = parseFloat(firstEl.style.opacity) || 1;
    const currentTransform = firstEl.style.transform || "";
    const currentFilter = firstEl.style.filter || "";
    const opacityMatches = Math.abs(currentOpacity - opacityInitial) < 0.01;
    const hasInitialOffset =
      currentTransform.includes(`${translateXInitial}px`) ||
      currentTransform.includes(`${translateYInitial}px`) ||
      (rotateInitial !== 0 &&
        currentTransform.includes(`${rotateInitial}deg`));
    const blurMatches =
      blurInitial === 0
        ? !currentFilter || currentFilter.includes("blur(0px)")
        : currentFilter.includes(`blur(${blurInitial}px)`);
    return opacityMatches && hasInitialOffset && blurMatches;
  };

  useEffect(() => {
    if (!scrollElementsRef.current) return;
    const elements = scrollElementsRef.current;
    if (isOutOfView) {
      animationControlsRef.current.forEach((control) => control.stop());
      animationControlsRef.current = [];
      if (reverse) {
        elements.forEach((el: any) => {
          el.style.opacity = opacityInitial.toString();
          el.style.transform = `translate3d(${translateXInitial}px, ${translateYInitial}px, 0) rotate(${rotateInitial}deg) scale(${scaleInitial})`;
          el.style.filter = `blur(${blurInitial}px)`;
        });
        hasAnimatedRef.current = false;
      }
      return;
    }
    if (isInView && areElementsInInitialState(elements)) {
      animationControlsRef.current.forEach((control) => control.stop());
      animationControlsRef.current = [];
      hasAnimatedRef.current = true;
      animateElements(elements, true);
    }
    /* LOCAL PATCH: when the element exits ABOVE the viewport (neither in view
       nor "out of view" below), do NOT stop running animations — the old code
       killed them unconditionally, freezing headings mid-reveal (half-blurred,
       offset) whenever the user scrolled past them quickly. Let the reveal
       finish naturally. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isInView,
    isOutOfView,
    reverse,
    translateXInitial,
    translateYInitial,
    opacityInitial,
    rotateInitial,
    scaleInitial,
    blurInitial,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    /* Reflow the split whenever the layout changes size — ResizeObserver
       covers container growth, the window listener covers viewport
       resizes / orientation changes. SplitText.revert() then re-split keeps
       line wraps correct; ScrollTrigger.refresh() re-syncs positions. */
    const reflow = () => {
      if (isFirstResizeRef.current) {
        isFirstResizeRef.current = false;
        return;
      }
      if (!hasAnimatedRef.current) return;
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (!hasAnimatedRef.current) return;
        const result = setupSplit(true);
        if (result) {
          scrollElementsRef.current = result.elements;
          result.elements.forEach((el: any) => {
            el.style.opacity = "1";
            el.style.transform = "translate3d(0px, 0px, 0) rotate(0deg) scale(1)";
            el.style.filter = "blur(0px)";
          });
        }
        ScrollTrigger.refresh();
      }, 50);
    };
    const resizeObserver = new ResizeObserver(reflow);
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", reflow);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", reflow);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`line-mask-split ${className}`}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "auto",
        backgroundColor: "transparent",
        ...style,
      }}
    >
      {React.createElement(
        TAG,
        {
          ref: textRef,
          style: {
            margin: 0,
            color,
            fontSize: font.fontSize,
            fontWeight: font.fontWeight || "700",
            fontFamily: font.fontFamily || "system-ui, -apple-system, sans-serif",
            fontStyle: font.fontStyle,
            textDecoration: font.textDecoration,
            textTransform: font.textTransform as React.CSSProperties["textTransform"],
            letterSpacing: font.letterSpacing,
            lineHeight: font.lineHeight,
            textAlign: font.textAlign || "center",
            marginBlock: 0,
            marginInline: 0,
            padding: 0,
            width: "100%",
          },
        },
        text
      )}
    </div>
  );
}