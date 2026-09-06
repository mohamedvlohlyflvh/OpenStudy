import { NextResponse } from "next/server";
import { parseAiCardsInput, type AiCardInput } from "@/lib/ai-import/schema";

// Direct AI card generation. The user pastes source text (notes, a
// transcript, a chapter) and we call Gemini ourselves, returning the same
// shape `bulkCreateFlashcards` already accepts — so the existing import
// pipeline is reused unchanged.
//
// Key design choices:
//  - 8 KB hard cap on the source text. Longer than that and the model
//    loses focus; users should chunk instead.
//  - Response is always a JSON `AiGenerateResponse`, never a stream. The
//    model is small and the call is short, so streaming buys nothing and
//    we can give the client a clean single-result contract.
//  - Output is parsed through the SAME zod schema as the NotebookLM
//    import, so a malformed response surfaces a SHAPE_MISMATCH error
//    the UI can recognize.

export const runtime = "nodejs"; // gemini SDK is a node module
export const maxDuration = 60; // 60s is the Vercel hobby limit; plenty.

const MAX_SOURCE_CHARS = 8_000;
const MIN_SOURCE_CHARS = 20;
// gemini-2.5-flash: cheap, fast, reliable JSON adherence.
// (gemini-2.0-flash and 3.6-flash are unstable on this key right now.)
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

interface AiGenerateResponse {
  ok: true;
  cards: AiCardInput[];
  model: string;
  /** ms the model call took, server-side. For the "GENERATED IN 3.2S" UI. */
  elapsedMs: number;
}
interface AiGenerateError {
  ok: false;
  error:
    | "NO_API_KEY"
    | "TEXT_TOO_SHORT"
    | "TEXT_TOO_LONG"
    | "RATE_LIMIT"
    | "UPSTREAM_ERROR"
    | "INVALID_JSON"
    | "SHAPE_MISMATCH"
    | "NO_CARDS";
  message: string;
}

const SYSTEM_INSTRUCTION = `You are a flashcard generator for a spaced-repetition study app.

Read the user's source text and return a JSON array of study flashcards. Each card must be an object with two required fields and several optional fields:

  "front"        — a short question, term, or prompt (max 200 chars)
  "back"         — the answer, definition, or explanation (max 800 chars)
  "description"  — optional short hint or mnemonic shown with the card (max 200 chars). Omit when nothing useful to add.
  "tags"         — optional array of 1-4 short topic keywords.
  "kind"         — optional card type: "basic" (default), "cloze", or "choice".
                     cloze:  put {{blanks}} in "front" around key terms, e.g. "Paris is {{the capital}} of France". "back" holds the full un-blanked statement.
                     choice: "back" is the correct answer; "choices" lists 2-4 wrong options as plain strings.
  "choices"      — required when kind is "choice": array of 2-4 wrong answers.

Rules:
- Return ONLY the JSON array, nothing else — no prose, no markdown fences, no commentary.
- One fact per card. Split dense passages into multiple cards.
- If the source is not in English, write the cards in the source's language.
- Skip trivia, references, acknowledgments, and metadata. Only teachable content.
- Use "front" for what the student should recall and "back" for the explanation.
- Aim for 5–25 cards. Quality over quantity; do not pad.`;

function jsonError(body: AiGenerateError, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * Salvage a JSON array that was cut off mid-output by the model's token
 * cap. Finds the last complete object in the array (`{"front": ... }`),
 * closes the array, and returns parseable JSON. Returns null when the
 * output has no complete object to salvage.
 */
function salvageTruncatedJson(raw: string): string | null {
  // Strip code fences if present
  let s = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  const start = s.indexOf("[");
  if (start === -1) return null;
  s = s.slice(start);
  // Find the last complete object: last "}" that's followed by nothing but
  // a comma (or whitespace) and cut there, then close the array.
  let lastBrace = -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0 && c === "}") {
        // A complete object just closed at top level of the array
        lastBrace = i;
      }
    }
  }
  if (lastBrace === -1) return null;
  return s.slice(0, lastBrace + 1) + "]";
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(
      {
        ok: false,
        error: "NO_API_KEY",
        message:
          "GEMINI_API_KEY is not set on the server. Add it to your .env and restart `npm run dev`.",
      },
      503
    );
  }

  let body: { text?: string; topicId?: string; subjectId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(
      { ok: false, error: "INVALID_JSON", message: "Request body must be JSON." },
      400
    );
  }
  const text = (body.text ?? "").trim();
  if (text.length < MIN_SOURCE_CHARS) {
    return jsonError(
      {
        ok: false,
        error: "TEXT_TOO_SHORT",
        message: `Source text is too short (${text.length} chars). Paste at least ${MIN_SOURCE_CHARS} characters of study material.`,
      },
      400
    );
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return jsonError(
      {
        ok: false,
        error: "TEXT_TOO_LONG",
        message: `Source text is ${text.length} chars; the cap is ${MAX_SOURCE_CHARS}. Split it into smaller chunks.`,
      },
      413
    );
  }

  // The user payload. Gemini wants the source inside a user turn so the
  // system instruction can stay verbatim across calls (cached implicitly).
  const userPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `SOURCE:\n"""${text}"""` }],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.4, // factual, low variance
      topP: 0.9,
      maxOutputTokens: 8192, // 4096 truncates mid-array on long/dense (Arabic) sources → INVALID_JSON
      responseMimeType: "application/json", // Gemini's structured-output knob
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL(apiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(userPayload),
    });
  } catch (e) {
    return jsonError(
      {
        ok: false,
        error: "UPSTREAM_ERROR",
        message: e instanceof Error ? e.message : "Failed to reach Gemini.",
      },
      502
    );
  }

  if (upstream.status === 429) {
    return jsonError(
      {
        ok: false,
        error: "RATE_LIMIT",
        message: "Gemini rate-limited the request. Wait a moment and try again.",
      },
      429
    );
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return jsonError(
      {
        ok: false,
        error: "UPSTREAM_ERROR",
        message: `Gemini returned ${upstream.status}. ${detail.slice(0, 240)}`,
      },
      502
    );
  }

  const upstreamJson = (await upstream.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const raw =
    upstreamJson.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!raw) {
    return jsonError(
      { ok: false, error: "INVALID_JSON", message: "Gemini returned an empty response." },
      502
    );
  }

  let cards: AiCardInput[];
  try {
    cards = parseAiCardsInput(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Salvage: if output was truncated mid-array (token cap), close the
    // array and keep the complete cards. Arabic-heavy payloads especially
    // blow the budget: ~3 tokens/char vs ~0.75 for English.
    if (msg === "INVALID_JSON") {
      const salvage = salvageTruncatedJson(raw);
      if (salvage) {
        try {
          cards = parseAiCardsInput(salvage);
          if (cards.length > 0) {
            return NextResponse.json({
              ok: true,
              cards,
              model: GEMINI_MODEL,
              elapsedMs: Date.now() - t0,
            });
          }
        } catch {
          /* fall through to the error below */
        }
      }
    }
    return jsonError(
      {
        ok: false,
        error: msg === "SHAPE_MISMATCH" || msg === "INVALID_JSON" ? msg : "SHAPE_MISMATCH",
        message: `Model output did not match the expected JSON shape (${msg}). Try again — a different sample usually works.`,
      },
      502
    );
  }

  if (cards.length === 0) {
    return jsonError(
      { ok: false, error: "NO_CARDS", message: "The model returned no usable cards." },
      502
    );
  }

  const body2: AiGenerateResponse = {
    ok: true,
    cards,
    model: GEMINI_MODEL,
    elapsedMs: Date.now() - t0,
  };
  return NextResponse.json(body2);
}
