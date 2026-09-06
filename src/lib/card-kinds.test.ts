import { describe, it, expect } from "vitest";
import {
  cardKind,
  extractClozeAnswers,
  isCloze,
  maskCloze,
  shuffled,
  cleanChoices,
} from "@/lib/card-kinds";

describe("card kinds", () => {
  it("treats missing/unknown kind as basic", () => {
    expect(cardKind({})).toBe("basic");
    expect(cardKind({ kind: null })).toBe("basic");
    expect(cardKind({ kind: "weird" })).toBe("basic");
    expect(cardKind({ kind: "cloze" })).toBe("cloze");
    expect(cardKind({ kind: "choice" })).toBe("choice");
  });

  it("extracts simple and Anki-style cloze answers", () => {
    expect(extractClozeAnswers("Paris is {{the capital}} of France")).toEqual([
      "the capital",
    ]);
    expect(extractClozeAnswers("{{c1::Paris}} fell in {{c2::1792::year}}")).toEqual([
      "Paris",
      "1792",
    ]);
    expect(extractClozeAnswers("no blanks here")).toEqual([]);
  });

  it("detects cloze fronts", () => {
    expect(isCloze("x {{y}}")).toBe(true);
    expect(isCloze("plain")).toBe(false);
  });

  it("masks spans, keeping hints", () => {
    expect(maskCloze("Paris is {{the capital}}")).toBe("Paris is ▯▯▯");
    expect(maskCloze("{{c1::1792::year}} was key")).toBe("▯▯▯ (year) was key");
  });

  it("shuffles without mutating", () => {
    const src = ["a", "b", "c", "d"];
    const out = shuffled(src);
    expect(out).toHaveLength(4);
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
    expect(src).toEqual(["a", "b", "c", "d"]);
  });

  it("cleans choice lists", () => {
    expect(cleanChoices([" a ", "", "A", "b", "  "])).toEqual(["a", "b"]);
  });
});
