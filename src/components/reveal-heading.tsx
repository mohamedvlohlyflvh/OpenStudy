// ─── RevealHeading — CSS-only masked heading reveal ────────────────
// Previously wrapped Originkit LineMaskSplit (per-char GSAP split +
// scroll observer). Now: a one-shot clip-path + rise animation on the
// whole heading — tiny DOM, zero per-frame JS, same entrance feel.
// Reduced motion (app toggle or OS) neutralizes it via the global
// animation-duration override in globals.css.

import { cn } from "@/lib/utils";

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
  const Tag = tag;
  return (
    <Tag
      className={cn(
        "heading-reveal uppercase tracking-tighter",
        className
      )}
      style={color ? { color } : undefined}
    >
      {text}
    </Tag>
  );
}
