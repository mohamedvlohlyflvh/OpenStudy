import type { NotebookSourceInput } from "./schema";

/**
 * Wrap a markdown body with a strict front-matter so a human (or future
 * import) can tell exactly where the source came from. NotebookLM
 * treats this as plain text and will ignore the comment block.
 */
export function buildNotebookSource(input: NotebookSourceInput, body: string): string {
  const stamp = new Date().toISOString();
  const flags = [
    input.includeCards && "cards",
    input.includeNotes && "notes",
    input.includeSessions && "sessions",
  ].filter(Boolean).join("+") || "none";

  return [
    `<!-- studymax-source`,
    `  kind: ${input.kind}`,
    `  sourceId: ${input.sourceId}`,
    `  title: ${input.title}`,
    `  includes: ${flags}`,
    `  exportedAt: ${stamp}`,
    `-->`,
    ``,
    `# ${input.title}`,
    ``,
    `_Exported from StudyMax on ${stamp}._`,
    ``,
    body.trim(),
    ``,
  ].join("\n");
}

/** Build a filesystem-safe filename from a title. */
export function sourceFilename(title: string): string {
  const safe = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "studymax-source";
  const stamp = new Date().toISOString().split("T")[0];
  return `${safe}-${stamp}.md`;
}