// ─── CSV / Anki import ──────────────────────────────────────
// Parses either:
//  - Basic CSV with front/back columns (header-aware): "front","back"
//  - Anki TSV export (.txt): tab-separated "front\tback\textra..." where
//    fields 1 and 2 are front/back and any trailing column is treated as tags
//    (comma-separated when Anki's tag column is present).
// Also accepts JSON arrays of { front, back } for flexibility.
export function parseCardsFile(raw: string): { front: string; back: string; tags?: string[] }[] {
  let trimmed = raw.trim();
  if (!trimmed) return [];

  // Strip markdown code fences (```json ... ```) — LLM replies (e.g. NotebookLM)
  // commonly wrap the JSON array in fences.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  } else {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  if (!trimmed) return [];

  // JSON array fallback
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr
          .map((r: unknown) => {
            const o = r as Record<string, unknown>;
            const front = String(o.front ?? o.question ?? o.q ?? "");
            const back = String(o.back ?? o.answer ?? o.a ?? "");
            if (!front.trim() || !back.trim()) return null;
            const tagStr = o.tags ?? o.tag;
            const tags =
              typeof tagStr === "string"
                ? tagStr
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                : Array.isArray(tagStr)
                  ? (tagStr as string[])
                  : undefined;
            return { front: front.trim(), back: back.trim(), ...(tags?.length ? { tags } : {}) };
          })
          .filter(Boolean) as { front: string; back: string; tags?: string[] }[];
      }
    } catch {
      // fall through to CSV/TSV
    }
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const result: { front: string; back: string; tags?: string[] }[] = [];

  for (const line of lines) {
    // Detect delimiter: tab (Anki) or comma (CSV)
    const isTsv = line.includes("\t");
    const delimiter = isTsv ? "\t" : ",";
    const cells = splitCsvLine(line, delimiter);

    if (cells.length < 2) continue;
    const front = cells[0].trim();
    const back = cells[1].trim();
    if (!front || !back) continue;

    // Skip header rows ("front,back" / "question,answer" etc.)
    const fl = front.toLowerCase();
    const bl = back.toLowerCase();
    if (
      (fl === "front" && bl === "back") ||
      (fl === "question" && bl === "answer") ||
      (fl === "q" && bl === "a")
    ) {
      continue;
    }

    // Trailing columns are tags (Anki exports may split them across columns).
    let tags: string[] | undefined;
    if (cells.length > 2) {
      tags = cells
        .slice(2)
        .flatMap((c) => (c.includes(",") ? c.split(",") : c.split(/\s+/)))
        .map((t) => t.trim())
        .filter(Boolean);
    }
    result.push({ front, back, ...(tags?.length ? { tags } : {}) });
  }

  return result;
}

// Minimal CSV/TSV cell splitter that respects double-quoted fields.
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}
