import { z } from "zod";

/** A single flashcard extracted from NotebookLM JSON output. */
export interface NotebookLMCard {
  question: string;
  answer: string;
}

const notebookLMSchema = z.array(
  z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })
);

export type NotebookLMArray = z.infer<typeof notebookLMSchema>;

/**
 * Clean + parse + validate raw NotebookLM output into strongly-typed cards.
 *
 * Handles common LLM reply wrappers:
 *   - fenced code blocks: ```json ... ```
 *   - bare fences:        ``` ... ```
 *   - surrounding whitespace / newlines
 *
 * Throws a descriptive Error on invalid input so callers can surface it.
 */
export function parseNotebookLMJSON(rawInput: string): NotebookLMArray {
  if (typeof rawInput !== "string") {
    throw new Error("Input must be a string.");
  }

  let cleaned = rawInput.trim();

  // Strip leading ```json / ``` and trailing ```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Also handle a leading fence without a closing one (common truncation).
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  if (!cleaned) {
    throw new Error("No JSON content found — clipboard was empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON: ${detail}`);
  }

  const result = notebookLMSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid flashcard shape: ${issues}`);
  }

  return result.data;
}
