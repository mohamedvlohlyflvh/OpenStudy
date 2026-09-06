import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the schema module before importing the route so we don't pull in
// the full zod tree in tests. The route only calls parseAiCardsXml once.
const parseAiCardsXml = vi.fn();
vi.mock("@/lib/ai-import/schema", () => ({
  parseAiCardsXml: (raw: string) => parseAiCardsXml(raw),
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

function geminiResponse(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("POST /api/ai/generate-cards", () => {
  beforeEach(() => {
    parseAiCardsXml.mockReset();
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

  it("returns 502 INVALID_OUTPUT when the model output fails XML parsing", async () => {
    fetchMock.mockResolvedValueOnce(geminiResponse("this is not xml"));
    parseAiCardsXml.mockImplementationOnce(() => {
      throw new Error("NO_CARDS_XML");
    });
    const res = await POST(req());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("NO_CARDS");
  });

  it("returns parsed cards with timing on success", async () => {
    const cards = [
      { front: "Q1", back: "A1", tags: ["t1"] },
      { front: "Q2", back: "A2" },
    ];
    fetchMock.mockResolvedValueOnce(
      geminiResponse("<cards><card><front>Q1</front><back>A1</back></card></cards>")
    );
    parseAiCardsXml.mockReturnValueOnce(cards);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cards).toEqual(cards);
    expect(body.model).toMatch(/^gemini-/);
    expect(typeof body.elapsedMs).toBe("number");
  });

  it("forwards unlimited card counts (no cap on cards returned)", async () => {
    const cards = Array.from({ length: 60 }, (_, i) => ({
      front: `Q${i}`,
      back: `A${i}`,
    }));
    fetchMock.mockResolvedValueOnce(geminiResponse("<cards>(60 cards)</cards>"));
    parseAiCardsXml.mockReturnValueOnce(cards);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cards).toHaveLength(60);
  });
});
