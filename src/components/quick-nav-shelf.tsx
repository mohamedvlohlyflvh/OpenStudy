"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Brain, StickyNote, Layers, ArrowRight } from "lucide-react";
import HoverImageReveal from "@/components/originkit/ui/hover-image-reveal";
import { useAppStore, type ThemeName } from "@/lib/store";

/* ─── Brutalist SVG tiles (data-URL strings — HoverImageReveal needs
       string sources). The palette is derived from the ACTIVE THEME so the
       tiles recolor with onyx/void/emerald/magma/grape/light instead of being
       stuck on black + acid yellow. `<img>` data-URLs can't read CSS vars,
       so the SVGs are rebuilt (memoized) whenever the theme changes. ─── */

interface TilePalette {
  canvas: string;      // tile background card
  surface: string;     // raised inner surface (note body)
  border: string;      // hairline frame
  borderStrong: string;// stacked-card / rule strokes
  accent: string;      // theme accent
  accentDark: string;  // gradient end-stop (darker accent)
  accentFg: string;    // text drawn ON the accent gradient
  fg: string;          // primary text
  mutedFg: string;     // secondary / mono captions
}

const TILE_PALETTES: Record<ThemeName, TilePalette> = {
  onyx:    { canvas: "#0A0A0B", surface: "#18181B", border: "#27272A", borderStrong: "#3F3F46", accent: "#FACC15", accentDark: "#A16207", accentFg: "#09090B", fg: "#FAFAFA", mutedFg: "#A1A1AA" },
  void:    { canvas: "#0A0D1F", surface: "#11142A", border: "#1E2238", borderStrong: "#2C3352", accent: "#6EA8FE", accentDark: "#1E3A8A", accentFg: "#05060E", fg: "#E7ECFF", mutedFg: "#8B93B8" },
  emerald: { canvas: "#04180F", surface: "#06241A", border: "#0C3B2B", borderStrong: "#14532D", accent: "#34D399", accentDark: "#065F46", accentFg: "#02100B", fg: "#E7FFF4", mutedFg: "#7FBFA6" },
  magma:   { canvas: "#1A0909", surface: "#271010", border: "#3A1818", borderStrong: "#57201F", accent: "#FB7185", accentDark: "#9F1239", accentFg: "#120606", fg: "#FFE9E3", mutedFg: "#C99B8F" },
  grape:   { canvas: "#120A1C", surface: "#1A1228", border: "#2A1D3E", borderStrong: "#3B2A58", accent: "#C084FC", accentDark: "#6B21A8", accentFg: "#0C0712", fg: "#F3E9FF", mutedFg: "#B09BC8" },
  light:   { canvas: "#FFFFFF", surface: "#E4E4E7", border: "#D4D4D8", borderStrong: "#A1A1AA", accent: "#854D0E", accentDark: "#57330A", accentFg: "#FFFFFF", fg: "#09090B", mutedFg: "#52525B" },
};

function tileSvg(id: string, p: TilePalette, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><defs><linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accentDark}"/></linearGradient></defs><rect width="300" height="400" fill="${p.canvas}"/><rect x="8" y="8" width="284" height="384" fill="none" stroke="${p.border}" stroke-width="2"/>${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildTiles(p: TilePalette) {
  return {
    bundles: tileSvg(
      "bundles",
      p,
      `<rect x="60" y="90" width="180" height="220" fill="none" stroke="${p.borderStrong}" stroke-width="3"/>
       <rect x="75" y="75" width="180" height="220" fill="none" stroke="${p.mutedFg}" stroke-width="3"/>
       <rect x="90" y="60" width="180" height="220" fill="url(#g-bundles)"/>
       <text x="180" y="195" font-family="Arial Black, sans-serif" font-size="88" font-weight="900" fill="${p.accentFg}" text-anchor="middle">B</text>
       <text x="150" y="352" font-family="monospace" font-size="16" fill="${p.mutedFg}" text-anchor="middle" letter-spacing="6">DECKS</text>`
    ),
    flashcards: tileSvg(
      "flashcards",
      p,
      `<rect x="70" y="70" width="160" height="110" fill="url(#g-flashcards)"/>
       <text x="150" y="142" font-family="Arial Black, sans-serif" font-size="56" font-weight="900" fill="${p.accentFg}" text-anchor="middle">Q</text>
       <rect x="70" y="210" width="160" height="110" fill="none" stroke="${p.accent}" stroke-width="3" stroke-dasharray="10 6"/>
       <text x="150" y="282" font-family="Arial Black, sans-serif" font-size="56" font-weight="900" fill="${p.accent}" text-anchor="middle">A</text>
       <text x="150" y="360" font-family="monospace" font-size="16" fill="${p.mutedFg}" text-anchor="middle" letter-spacing="6">REVIEW</text>`
    ),
    subjects: tileSvg(
      "subjects",
      p,
      `<rect x="62" y="62" width="82" height="82" fill="url(#g-subjects)"/>
       <rect x="156" y="62" width="82" height="82" fill="none" stroke="${p.borderStrong}" stroke-width="3"/>
       <rect x="62" y="156" width="82" height="82" fill="none" stroke="${p.borderStrong}" stroke-width="3"/>
       <rect x="156" y="156" width="82" height="82" fill="${p.borderStrong}"/>
       <text x="150" y="308" font-family="Arial Black, sans-serif" font-size="40" font-weight="900" fill="${p.fg}" text-anchor="middle">TOPICS</text>
       <text x="150" y="356" font-family="monospace" font-size="16" fill="${p.mutedFg}" text-anchor="middle" letter-spacing="6">ORGANIZE</text>`
    ),
    notes: tileSvg(
      "notes",
      p,
      `<rect x="70" y="55" width="160" height="230" fill="${p.surface}" stroke="${p.borderStrong}" stroke-width="2"/>
       <rect x="90" y="85" width="120" height="10" fill="url(#g-notes)"/>
       <rect x="90" y="115" width="100" height="6" fill="${p.mutedFg}"/>
       <rect x="90" y="135" width="120" height="6" fill="${p.mutedFg}"/>
       <rect x="90" y="155" width="80" height="6" fill="${p.mutedFg}"/>
       <rect x="90" y="185" width="120" height="6" fill="${p.borderStrong}"/>
       <rect x="90" y="205" width="110" height="6" fill="${p.borderStrong}"/>
       <rect x="90" y="235" width="60" height="16" fill="${p.accent}"/>
       <text x="150" y="352" font-family="monospace" font-size="16" fill="${p.mutedFg}" text-anchor="middle" letter-spacing="6">MARKDOWN</text>`
    ),
  };
}

const NAV_ITEMS: { key: keyof ReturnType<typeof buildTiles>; href: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "bundles", href: "/bundles", label: "BUNDLES", desc: "FLASHCARD DECKS", icon: <Layers size={20} /> },
  { key: "flashcards", href: "/flashcards", label: "FLASHCARDS", desc: "REVIEW & MANAGE", icon: <Brain size={20} /> },
  { key: "subjects", href: "/subjects", label: "SUBJECTS", desc: "ORGANIZE TOPICS", icon: <BookOpen size={20} /> },
  { key: "notes", href: "/notes", label: "NOTES", desc: "STUDY MATERIAL", icon: <StickyNote size={20} /> },
];

/**
 * Quick Access — Originkit HoverImageReveal shelf: hovering a row chases a
 * brutalist tile preview with the cursor. Falls back to the static link grid
 * under reduced motion (app pref or OS) and on touch devices.
 */
export function QuickNavShelf() {
  const reducedMotionPref = useAppStore((s) => s.reducedMotion);
  const theme = useAppStore((s) => s.theme);
  const [osReduced, setOsReduced] = useState(false);
  const [coarse, setCoarse] = useState(false);

  // Rebuild the SVG tiles only when the theme changes.
  const tiles = useMemo(() => buildTiles(TILE_PALETTES[theme] ?? TILE_PALETTES.onyx), [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    const touch = window.matchMedia("(pointer: coarse)");
    const updateTouch = () => setCoarse(touch.matches);
    updateTouch();
    touch.addEventListener("change", updateTouch);
    return () => {
      mq.removeEventListener("change", update);
      touch.removeEventListener("change", updateTouch);
    };
  }, []);

  const reduced = reducedMotionPref || osReduced || coarse;

  if (reduced) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {NAV_ITEMS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center justify-between border-2 border-border bg-bg p-6 transition-all duration-200 hover:border-accent hover:bg-accent/5"
          >
            <div className="flex items-center gap-4">
              <span className="text-muted-fg transition-colors group-hover:text-accent">{link.icon}</span>
              <div>
                <p className="font-bold uppercase tracking-tight">{link.label}</p>
                <p className="text-xs text-muted-fg uppercase tracking-widest">{link.desc}</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-muted-fg transition-transform group-hover:translate-x-1 group-hover:text-accent" />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="border-2 border-border">
      <HoverImageReveal
        items={{
          itemCount: NAV_ITEMS.length,
          item1: { text: NAV_ITEMS[0].label, image: { src: tiles[NAV_ITEMS[0].key], alt: NAV_ITEMS[0].label }, link: NAV_ITEMS[0].href },
          item2: { text: NAV_ITEMS[1].label, image: { src: tiles[NAV_ITEMS[1].key], alt: NAV_ITEMS[1].label }, link: NAV_ITEMS[1].href },
          item3: { text: NAV_ITEMS[2].label, image: { src: tiles[NAV_ITEMS[2].key], alt: NAV_ITEMS[2].label }, link: NAV_ITEMS[2].href },
          item4: { text: NAV_ITEMS[3].label, image: { src: tiles[NAV_ITEMS[3].key], alt: NAV_ITEMS[3].label }, link: NAV_ITEMS[3].href },
        }}
        font={{
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.4,
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
        }}
        textColor="var(--color-fg)"
        dimColor="var(--color-muted-fg)"
        align="left"
        rowGap={8}
        imageWidth={210}
        imageHeight={280}
        rounded={0}
        offsetX={140}
        backgroundColor="transparent"
        style={{ padding: "16px 24px" }}
      />
    </div>
  );
}
