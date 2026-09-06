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

import { POST } from "@/app/api/ai/analyze-image/route";

const API_KEY = "test-key-123";

function pngBlob() {
  // minimal PNG header bytes — the route only checks file.type/size
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "notes.png", {
    type: "image/png",
  });
}

function reqWithImage(file: File | null, field = "image") {
  const fd = new FormData();
  if (file) fd.append(field, file);
  return new Request("http://localhost/api/ai/analyze-image", {
    method: "POST",
    body: fd,
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

describe("POST /api/ai/analyze-image", () => {
  beforeEach(() => {
    parseAiCardsXml.mockReset();
    fetchMock.mockReset();
    process.env.GEMINI_API_KEY = API_KEY;
  });

  it("returns 503 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("NO_API_KEY");
  });

  it("returns 400 when no image is uploaded", async () => {
    const res = await POST(reqWithImage(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("NO_IMAGE");
  });

  it("returns 415 for non-image files", async () => {
    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    const res = await POST(reqWithImage(txt));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe("UNSUPPORTED_TYPE");
  });

  it("returns 502 NO_CARDS when model output has no valid <card> elements", async () => {
    fetchMock.mockResolvedValueOnce(geminiResponse("not xml"));
    parseAiCardsXml.mockImplementationOnce(() => {
      throw new Error("NO_CARDS_XML");
    });
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("NO_CARDS");
  });

  it("returns parsed cards + ocrPreview on success", async () => {
    const cards = [{ front: "Q?", back: "A." }];
    fetchMock.mockResolvedValueOnce(
      geminiResponse(
        "<cards><card><front>Q?</front><back>A.</back></card></cards>"
      )
    );
    parseAiCardsXml.mockReturnValueOnce(cards);
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cards).toEqual(cards);
    expect(typeof body.ocrPreview).toBe("string");
    expect(typeof body.elapsedMs).toBe("number");
  });

  it("keeps every complete card when output truncates mid-<card>", async () => {
    // simulate truncation: two complete cards + an unterminated third
    const truncated =
      "<cards><card><front>Q1</front><back>A1</back></card>" +
      "<card><front>Q2</front><back>A2</back></card>" +
      "<card><front>Q3</front><back>A3 unpars";
    fetchMock.mockResolvedValueOnce(geminiResponse(truncated));
    parseAiCardsXml.mockImplementationOnce((raw: string) => {
      // emulate the real parser's truncation tolerance
      const out: { front: string; back: string }[] = [];
      const re = /<card(?:\s[^>]*)?>([\s\S]*?)<\/card>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        const f = m[1].match(/<front>([^<]*)<\/front>/);
        const b = m[1].match(/<back>([^<]*)<\/back>/);
        if (f && b) out.push({ front: f[1], back: b[1] });
      }
      if (out.length === 0) throw new Error("NO_CARDS_XML");
      return out;
    });
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cards).toHaveLength(2); // Q3 dropped, Q1+Q2 survive
  });
});
