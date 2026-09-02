import { z } from "zod";

/**
 * JSON shape we accept when importing flashcards from an external LLM
 * (NotebookLM, ChatGPT, Gemini, hand-typed, ...). Two top-level shapes:
 *   - Bare array:  [{ front, back, tags?, description?, difficulty? }, ...]
 *   - Wrapped:     { cards: [{ front, back, ... }] }
 * Both go through `parseAiCardsInput` which normalises to the array form.
 */
export const AiCardInput = z.object({
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(8000),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});
export type AiCardInput = z.infer<typeof AiCardInput>;

export const AiCardsBareArray = z.array(AiCardInput).min(1).max(2000);
export const AiCardsWrapped = z.object({ cards: AiCardsBareArray });

export function parseAiCardsInput(raw: string): AiCardInput[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("EMPTY_INPUT");
  // Strip ```json fences and leading "json" if the LLM added them.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error("INVALID_JSON");
  }
  // Try bare array first; fall back to { cards: [...] }
  const bare = AiCardsBareArray.safeParse(parsed);
  if (bare.success) return bare.data;
  const wrapped = AiCardsWrapped.safeParse(parsed);
  if (wrapped.success) return wrapped.data.cards;
  throw new Error("SHAPE_MISMATCH");
}

/**
 * The single prompt we hand to the user. One block, copy it as-is.
 * Designed for NotebookLM specifically but works in any chat LLM.
 */
export const NOTEBOOKLM_IMPORT_PROMPT = `You are a flashcard generator. Read the source below and return a JSON array of study flashcards. Each card must be an object with two required fields and one optional field:

  "front" — a short question, term, or prompt (max 200 chars)
  "back"  — the answer, definition, or explanation (max 800 chars)
  "description" — an optional short hint, context, or mnemonic shown with the card (max 200 chars). Omit it when the source has nothing useful to add.

Rules:
- Return ONLY the JSON array, nothing else — no prose, no markdown fences, no commentary.
- One fact per card. Split dense passages into multiple cards.
- If the source is not in English, write the cards in the source's language.
- Skip trivia, references, acknowledgments, and metadata. Only teachable content.
- Use "front" for what the student should recall and "back" for the explanation.
- Aim for 8–25 cards unless the source is genuinely tiny.

Output format (return this exact shape, with your cards in place of "..."):
[
  { "front": "...", "back": "...", "description": "..." },
  { "front": "...", "back": "..." }
]

SOURCE TO CONVERT:
[PASTE YOUR LESSON, NOTES, OR DOCUMENT TEXT HERE]
`;
