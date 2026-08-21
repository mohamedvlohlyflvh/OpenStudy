"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Brain, StickyNote, Layers, ArrowRight } from "lucide-react";
import HoverImageReveal from "@/components/originkit/ui/hover-image-reveal";
import { useAppStore } from "@/lib/store";

/* ─── Brutalist SVG tiles (data-URL strings — HoverImageReveal needs
       string sources). Unique gradient IDs per tile to avoid inline-SVG
       collisions. Fixed art palette: near-black + acid yellow + white. ─── */

const TILE_BG = "#0A0A0B";
const TILE_ACCENT = "#FACC15";

function tileSvg(id: string, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><defs><linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TILE_ACCENT}"/><stop offset="1" stop-color="#A16207"/></linearGradient></defs><rect width="300" height="400" fill="${TILE_BG}"/><rect x="8" y="8" width="284" height="384" fill="none" stroke="#27272A" stroke-width="2"/>${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TILES = {
  bundles: tileSvg(
    "bundles",
    `<rect x="60" y="90" width="180" height="220" fill="none" stroke="#3F3F46" stroke-width="3"/>
     <rect x="75" y="75" width="180" height="220" fill="none" stroke="#71717A" stroke-width="3"/>
     <rect x="90" y="60" width="180" height="220" fill="url(#g-bundles)"/>
     <text x="180" y="195" font-family="Arial Black, sans-serif" font-size="88" font-weight="900" fill="${TILE_BG}" text-anchor="middle">B</text>
     <text x="150" y="352" font-family="monospace" font-size="16" fill="#A1A1AA" text-anchor="middle" letter-spacing="6">DECKS</text>`
  ),
  flashcards: tileSvg(
    "flashcards",
    `<rect x="70" y="70" width="160" height="110" fill="url(#g-flashcards)"/>
     <text x="150" y="142" font-family="Arial Black, sans-serif" font-size="56" font-weight="900" fill="${TILE_BG}" text-anchor="middle">Q</text>
     <rect x="70" y="210" width="160" height="110" fill="none" stroke="${TILE_ACCENT}" stroke-width="3" stroke-dasharray="10 6"/>
     <text x="150" y="282" font-family="Arial Black, sans-serif" font-size="56" font-weight="900" fill="${TILE_ACCENT}" text-anchor="middle">A</text>
     <text x="150" y="360" font-family="monospace" font-size="16" fill="#A1A1AA" text-anchor="middle" letter-spacing="6">REVIEW</text>`
  ),
  subjects: tileSvg(
    "subjects",
    `<rect x="62" y="62" width="82" height="82" fill="url(#g-subjects)"/>
     <rect x="156" y="62" width="82" height="82" fill="none" stroke="#3F3F46" stroke-width="3"/>
     <rect x="62" y="156" width="82" height="82" fill="none" stroke="#3F3F46" stroke-width="3"/>
     <rect x="156" y="156" width="82" height="82" fill="#3F3F46"/>
     <text x="150" y="308" font-family="Arial Black, sans-serif" font-size="40" font-weight="900" fill="#FAFAFA" text-anchor="middle">TOPICS</text>
     <text x="150" y="356" font-family="monospace" font-size="16" fill="#A1A1AA" text-anchor="middle" letter-spacing="6">ORGANIZE</text>`
  ),
  notes: tileSvg(
    "notes",
    `<rect x="70" y="55" width="160" height="230" fill="#18181B" stroke="#3F3F46" stroke-width="2"/>
     <rect x="90" y="85" width="120" height="10" fill="url(#g-notes)"/>
     <rect x="90" y="115" width="100" height="6" fill="#52525B"/>
     <rect x="90" y="135" width="120" height="6" fill="#52525B"/>
     <rect x="90" y="155" width="80" height="6" fill="#52525B"/>
     <rect x="90" y="185" width="120" height="6" fill="#3F3F46"/>
     <rect x="90" y="205" width="110" height="6" fill="#3F3F46"/>
     <rect x="90" y="235" width="60" height="16" fill="${TILE_ACCENT}"/>
     <text x="150" y="352" font-family="monospace" font-size="16" fill="#A1A1AA" text-anchor="middle" letter-spacing="6">MARKDOWN</text>`
  ),
};

const NAV_ITEMS = [
  { key: "bundles", href: "/bundles", label: "BUNDLES", desc: "FLASHCARD DECKS", icon: <Layers size={20} />, tile: TILES.bundles },
  { key: "flashcards", href: "/flashcards", label: "FLASHCARDS", desc: "REVIEW & MANAGE", icon: <Brain size={20} />, tile: TILES.flashcards },
  { key: "subjects", href: "/subjects", label: "SUBJECTS", desc: "ORGANIZE TOPICS", icon: <BookOpen size={20} />, tile: TILES.subjects },
  { key: "notes", href: "/notes", label: "NOTES", desc: "STUDY MATERIAL", icon: <StickyNote size={20} />, tile: TILES.notes },
];

/**
 * Quick Access — Originkit HoverImageReveal shelf: hovering a row chases a
 * brutalist tile preview with the cursor. Falls back to the static link grid
 * under reduced motion (app pref or OS) and on touch devices.
 */
export function QuickNavShelf() {
  const reducedMotionPref = useAppStore((s) => s.reducedMotion);
  const [osReduced, setOsReduced] = useState(false);
  const [coarse, setCoarse] = useState(false);

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
          item1: { text: NAV_ITEMS[0].label, image: { src: NAV_ITEMS[0].tile, alt: NAV_ITEMS[0].label }, link: NAV_ITEMS[0].href },
          item2: { text: NAV_ITEMS[1].label, image: { src: NAV_ITEMS[1].tile, alt: NAV_ITEMS[1].label }, link: NAV_ITEMS[1].href },
          item3: { text: NAV_ITEMS[2].label, image: { src: NAV_ITEMS[2].tile, alt: NAV_ITEMS[2].label }, link: NAV_ITEMS[2].href },
          item4: { text: NAV_ITEMS[3].label, image: { src: NAV_ITEMS[3].tile, alt: NAV_ITEMS[3].label }, link: NAV_ITEMS[3].href },
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
