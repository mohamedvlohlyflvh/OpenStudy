// ─── CSV / Anki import ──────────────────────────────────────
// Parses either:
//  - Basic CSV with front/back columns (header-aware): "front","back".
//    When the FIRST data line is a recognized header row, a description-style
//    column (description|desc|hint|note|notes) becomes the card's optional
//    description, and tag-style columns (tag|tags, plus any other trailing
//    column) become tags. The terse "q,a" pair is only treated as a header
//    when bare — "q,a,…" rows with extra cells are data.
//  - Anki TSV export (.txt): tab-separated "front\tback\textra..." where
//    fields 1 and 2 are front/back and any trailing column is treated as tags
//    (comma-separated when Anki's tag column is present). Headerless TSV
//    keeps this legacy mapping — trailing columns are never description.
// Also accepts JSON arrays of { front, back, description? } for flexibility
// (description also accepts the aliases desc/hint/note/notes).
// Header names that map a column to the card's optional description.
const DESCRIPTION_HEADERS = new Set(["description", "desc", "hint", "note", "notes"]);

export function parseCardsFile(
  raw: string
): { front: string; back: string; tags?: string[]; description?: string }[] {
  let trimmed = raw.trim();
  if (!trimmed) return [];

  // Strip markdown code fences — LLM replies commonly wrap the JSON array in fences.
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
            const rawDesc = o.description ?? o.desc ?? o.hint ?? o.note ?? o.notes;
            const description =
              rawDesc === undefined || rawDesc === null
                ? undefined
                : String(rawDesc).trim() || undefined;
            return {
              front: front.trim(),
              back: back.trim(),
              ...(tags?.length ? { tags } : {}),
              ...(description ? { description } : {}),
            };
          })
          .filter(Boolean) as {
          front: string;
          back: string;
          tags?: string[];
          description?: string;
        }[];
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

  const result: { front: string; back: string; tags?: string[]; description?: string }[] = [];

  // Column map built from the first data line when it is a recognized header
  // row. `tagCols === undefined` means no header was recognized → legacy
  // behavior (all trailing columns are tags, e.g. headerless Anki TSV).
  let descCol: number | undefined;
  let tagCols: number[] | undefined;
  let first = true;

  for (const line of lines) {
    // Detect delimiter: tab (Anki) or comma (CSV)
    const isTsv = line.includes("\t");
    const delimiter = isTsv ? "\t" : ",";
    const cells = splitCsvLine(line, delimiter);

    if (cells.length < 2) continue;
    const front = cells[0].trim();
    const back = cells[1].trim();
    if (!front || !back) continue;

    // Skip header rows ("front,back" / "question,answer" etc.). The FIRST one
    // is consumed as a header and builds a column map from all of its cells.
    // The terse "q,a" pair only counts as a header when bare (2 cells) —
    // otherwise an Anki data row like "q\ta\ttag1 tag2" would be swallowed.
    const isHeaderRow =
      (front.toLowerCase() === "front" && back.toLowerCase() === "back") ||
      (front.toLowerCase() === "question" && back.toLowerCase() === "answer") ||
      (front.toLowerCase() === "q" && back.toLowerCase() === "a" && cells.length === 2);

    if (first) {
      first = false;
      if (isHeaderRow) {
        descCol = undefined;
        tagCols = [];
        for (let i = 2; i < cells.length; i++) {
          const name = cells[i].toLowerCase();
          if (DESCRIPTION_HEADERS.has(name)) {
            if (descCol === undefined) descCol = i;
          } else {
            // "tag"/"tags" columns and any unrecognized trailing column stay tags
            tagCols.push(i);
          }
        }
        continue;
      }
    } else if (isHeaderRow && !tagCols) {
      // No header was recognized → legacy behavior: skip header-looking rows.
      // (After a consumed header, rows like "q,a,hint" are data, not headers.)
      continue;
    }

    let tags: string[] | undefined;
    let description: string | undefined;
    if (tagCols) {
      // Header-mapped row: description/tags come from their mapped columns.
      if (descCol !== undefined && descCol < cells.length) {
        const d = cells[descCol].trim();
        if (d) description = d;
      }
      const tagCells = tagCols.filter((i) => i < cells.length).map((i) => cells[i]);
      if (tagCells.length) {
        tags = tagCells
          .flatMap((c) => (c.includes(",") ? c.split(",") : c.split(/\s+/)))
          .map((t) => t.trim())
          .filter(Boolean);
      }
    } else if (cells.length > 2) {
      // No header recognized: trailing columns are tags (Anki exports may
      // split them across columns).
      tags = cells
        .slice(2)
        .flatMap((c) => (c.includes(",") ? c.split(",") : c.split(/\s+/)))
        .map((t) => t.trim())
        .filter(Boolean);
    }
    result.push({
      front,
      back,
      ...(tags?.length ? { tags } : {}),
      ...(description ? { description } : {}),
    });
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
