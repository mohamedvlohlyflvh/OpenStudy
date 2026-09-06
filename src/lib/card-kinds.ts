// ─── Card kinds: basic / cloze / multiple-choice ────────────────
// Cloze syntax: {{answer}} or Anki-style {{c1::answer}} / {{c1::answer::hint}}.
// Choice cards: `back` is the correct answer, `choices` holds distractors.

import type { CardKind } from "./db";
export type { CardKind };

export const CARD_KINDS: CardKind[] = ["basic", "cloze", "choice"];

/** Old records predate `kind` — they are basic cards. */
export function cardKind(c: { kind?: string | null }): CardKind {
  return c.kind === "cloze" || c.kind === "choice" ? c.kind : "basic";
}

/** Raw cloze spans in source order, e.g. ["Paris", "1792"]. */
export function extractClozeAnswers(front: string): string[] {
  const out: string[] = [];
  const re = /\{\{(?:c\d+::)?(.+?)(?:::.+?)?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(front)) !== null) out.push(m[1]);
  return out;
}

export function isCloze(front: string): boolean {
  return extractClozeAnswers(front).length > 0;
}

/** Front with every cloze span replaced by blanks (hint shown when present). */
export function maskCloze(front: string): string {
  return front.replace(/\{\{(?:c\d+::)?(.+?)(?:::(.+?))?\}\}/g, (_m, _ans, hint) =>
    hint ? `▯▯▯ (${hint})` : "▯▯▯"
  );
}

/** Non-mutating shuffle for presenting choice options. */
export function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Clean a raw choices list: trim, drop empties and dupes. */
export function cleanChoices(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = r.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}
