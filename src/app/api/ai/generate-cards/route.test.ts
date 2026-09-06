import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the schema module before importing the route so we don't pull in
// the full zod tree in tests. The route only calls parseAiCardsInput once.
const parseAiCardsInput = vi.fn();
vi.mock("@/lib/ai-import/schema", () => ({
  parseAiCardsInput: (raw: string) => parseAiCardsInput(raw),
}));

// Mock global fetch so no real Gemini call is made.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "@/app/api/ai/generate-cards/route";

const VALID_TEXT = "x".repeat(200); // > MIN, < MAX
const API_KEY = "test-key-123";

function req(text: string | object = { text: VALID_TEXT }) {
  return new Request("http://localhost/api/ai/generate-cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof text === "string" ? text : JSON.stringify(text),
  });
}

describe("POST /api/ai/generate-cards", () => {
  beforeEach(() => {
    parseAiCardsInput.mockReset();
    fetchMock.mockReset();
    process.env.GEMINI_API_KEY = API_KEY;
  });

  it("returns 503 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("NO_API_KEY");
  });

  it("returns 400 for empty/short text", async () => {
    const res = await POST(req({ text: "too short" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("TEXT_TOO_SHORT");
  });

  it("returns 413 for over-cap text", async () => {
    const res = await POST(req({ text: "a".repeat(8_001) }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("TEXT_TOO_LONG");
  });

  it("returns 429 when upstream rate-limits", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("rate limited", { status: 429 })
    );
    const res = await POST(req());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT");
  });

  it("returns 502 with SHAPE_MISMATCH when the model output fails parsing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "this is not json" }] } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    parseAiCardsInput.mockImplementationOnce(() => {
      throw new Error("SHAPE_MISMATCH");
    });
    const res = await POST(req());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("SHAPE_MISMATCH");
  });

  it("returns parsed cards with timing on success", async () => {
    const cards = [{ front: "Q1", back: "A1" }];
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(cards) }] } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    parseAiCardsInput.mockReturnValueOnce(cards);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cards).toEqual(cards);
    expect(body.model).toMatch(/^gemini-/);
    expect(typeof body.elapsedMs).toBe("number");
  });
});
