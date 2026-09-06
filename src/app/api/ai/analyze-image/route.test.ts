import { describe, expect, it, vi, beforeEach } from "vitest";

const parseAiCardsInput = vi.fn();
vi.mock("@/lib/ai-import/schema", () => ({
  parseAiCardsInput: (raw: string) => parseAiCardsInput(raw),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "@/app/api/ai/analyze-image/route";

const API_KEY = "AIza-test";

function pngBlob() {
  // 1x1 transparent PNG (smallest valid PNG)
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return new File([bytes], "test.png", { type: "image/png" });
}

function reqWithImage(file?: File) {
  const fd = new FormData();
  if (file) fd.append("image", file);
  return new Request("http://localhost/api/ai/analyze-image", {
    method: "POST",
    body: fd,
  });
}

describe("POST /api/ai/analyze-image", () => {
  beforeEach(() => {
    parseAiCardsInput.mockReset();
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

  it("returns 400 NO_IMAGE when no file is sent", async () => {
    const res = await POST(reqWithImage());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("NO_IMAGE");
  });

  it("returns 415 UNSUPPORTED_TYPE for non-image uploads", async () => {
    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    const res = await POST(reqWithImage(txt));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe("UNSUPPORTED_TYPE");
  });

  it("returns 502 INVALID_JSON when model output is bad JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "not json" }] } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    parseAiCardsInput.mockImplementationOnce(() => {
      throw new Error("INVALID_JSON");
    });
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("INVALID_JSON");
  });

  it("returns parsed cards + ocrPreview on success", async () => {
    const cards = [{ front: "Q?", back: "A." }];
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(cards) }],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    parseAiCardsInput.mockReturnValueOnce(cards);
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cards).toEqual(cards);
    expect(body.model).toMatch(/^gemini/);
    expect(typeof body.ocrPreview).toBe("string");
    expect(typeof body.elapsedMs).toBe("number");
  });

  it("returns 429 when Gemini rate-limits", async () => {
    fetchMock.mockResolvedValueOnce(new Response("rate", { status: 429 }));
    const res = await POST(reqWithImage(pngBlob()));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMIT");
  });
});
