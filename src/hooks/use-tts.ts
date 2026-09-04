"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// ─── Text-to-Speech — free, browser-native speechSynthesis ────────
// No API, no keys, no cost. Windows ships local Arabic + English
// voices; works fully offline. Persian/English toggle per utterance.

export type TtsLang = "ar" | "en";

interface TtsOptions {
  /** BCP-47 tag spoken per utterance; default ar-EG (falls back per-voice) */
  lang?: string;
  /** 0.1..2 */
  rate?: number;
  /** 0..2 */
  pitch?: number;
}

function stripMd(s: string): string {
  return (
    s
      // code spans/blocks → keep words, drop markers
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      // images / links → label
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // emphasis markers
      .replace(/(\*\*|__|\*|_|~~)/g, "")
      // headings markers
      .replace(/^#{1,6}\s+/gm, "")
      // lists / blockquotes markers
      .replace(/^\s*[-*+>]\s+/gm, "")
      // strikethrough / tables / html
      .replace(/~~/g, "")
      .replace(/\|/g, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      // collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Arabic script detector (covers Arabic + Arabic-script languages).
// Anything else falls back to the English voice.
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function useTts() {
  const [ttsOn, setTtsOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // SSR-safe feature detection — the codebase's canonical pattern
  // (same as the Modal mounted probe; NO setState-in-effect).
  const supported = useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window,
    () => false
  );
  const voicesRef = useRef<{ ar: SpeechSynthesisVoice | null; en: SpeechSynthesisVoice | null }>({ ar: null, en: null });
  const doneCallbackRef = useRef<(() => void) | null>(null);

  // Pick voices per language; re-pick when Chrome populates the list async.
  // Bilingual app: Arabic cards get the Arabic voice, English/other cards
  // get an English voice — chosen per utterance by script detection.
  useEffect(() => {
    if (!supported) return;
    const pickVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      voicesRef.current = {
        ar:
          voices.find((v) => v.lang === "ar-EG" && v.localService) ||
          voices.find((v) => v.lang.startsWith("ar")) ||
          voices.find((v) => v.lang === "ar") ||
          null,
        en:
          voices.find((v) => v.lang === "en-US" && v.localService) ||
          voices.find((v) => v.lang.startsWith("en") && v.localService) ||
          voices.find((v) => v.lang.startsWith("en")) ||
          null,
      };
    };
    pickVoices();
    window.speechSynthesis.onvoiceschanged = pickVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  const speak = useCallback(
    (text: string, opts?: TtsOptions & { onDone?: () => void }) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel(); // one voice at a time — never stack utterances
      const clean = stripMd(text);
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      // Per-utterance language: Arabic script → Arabic voice, else English.
      const isArabic = ARABIC_RE.test(clean);
      u.lang = opts?.lang ?? (isArabic ? "ar-EG" : "en-US");
      const voice = isArabic ? voicesRef.current.ar : voicesRef.current.en;
      if (voice) u.voice = voice;
      u.rate = opts?.rate ?? 1;
      u.pitch = opts?.pitch ?? 1;
      doneCallbackRef.current = opts?.onDone ?? null;
      u.onend = () => {
        setSpeaking(false);
        doneCallbackRef.current?.();
        doneCallbackRef.current = null;
      };
      u.onerror = () => {
        setSpeaking(false);
        doneCallbackRef.current?.();
        doneCallbackRef.current = null;
      };
      setSpeaking(true);
      synth.speak(u);
    },
    []
  );

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    doneCallbackRef.current = null;
  }, []);

  const toggle = useCallback(() => setTtsOn((v) => !v), []);

  // Kill any in-flight speech when the hook unmounts (route change etc.)
  useEffect(() => stop, [stop]);

  return { ttsOn, toggle, speaking, speak, stop, supported };
}
