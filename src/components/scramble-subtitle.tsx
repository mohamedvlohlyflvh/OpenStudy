// ─── ScrambleSubtitle — CSS-only staggered word reveal ─────────────
// Previously wrapped Originkit GlitchCharReveal, which drove EVERY
// character through React state (~60 re-renders/sec on long subtitles)
// and caused visible lag. This version staggers whole WORDS with a
// one-shot CSS animation: tiny DOM, zero per-frame JS, same kinetic feel.
// Reduced motion (app toggle or OS) neutralizes it via the global
// animation-duration override in globals.css — no JS check needed.

const RISE_DELAY_MS = 45;

export function ScrambleSubtitle({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <p className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <span
            className="word-rise"
            style={{ animationDelay: `${i * RISE_DELAY_MS}ms` }}
          >
            {w}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
