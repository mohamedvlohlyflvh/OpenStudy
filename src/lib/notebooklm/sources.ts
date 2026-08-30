import { db } from "@/lib/db";

export async function buildBundleSource(bundleId: string): Promise<{ title: string; body: string }> {
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) throw new Error(`Bundle ${bundleId} not found`);
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  const body = [
    `## ${cards.length} flashcards`,
    ``,
    ...cards.flatMap((c, i) => [
      `### Card ${i + 1}`,
      `**Front:** ${c.front}`,
      ``,
      `**Back:** ${c.back}`,
      ``,
    ]),
  ].join("\n");
  return { title: `Bundle: ${bundle.name}`, body };
}

export async function buildSubjectSource(subjectId: string): Promise<{ title: string; body: string }> {
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new Error(`Subject ${subjectId} not found`);
  const topics = await db.topics.where("subjectId").equals(subjectId).toArray();
  const notes = await db.notes.toArray();
  const cards = await db.flashcards.toArray();

  const sections: string[] = [];
  sections.push(`## ${topics.length} topics`);
  for (const t of topics) {
    sections.push(`### ${t.name}`);
    sections.push("");
    const tNotes = notes.filter(n => n.topicId === t.id);
    if (tNotes.length === 0) sections.push("_No notes._");
    for (const n of tNotes) {
      sections.push(`#### Note: ${n.title}`);
      sections.push(n.content);
      sections.push("");
    }
  }
  sections.push(`## ${cards.length} flashcards (all subjects)`);
  for (const c of cards) {
    sections.push(`- **${c.front}** — ${c.back}`);
  }
  return { title: `Subject: ${subject.name}`, body: sections.join("\n") };
}

export async function buildNotesSetSource(noteIds: string[]): Promise<{ title: string; body: string }> {
  const notes = await db.notes.bulkGet(noteIds);
  const valid = notes.filter((n): n is NonNullable<typeof n> => Boolean(n));
  const body = valid.map(n => `## ${n.title}\n\n${n.content}`).join("\n\n");
  return { title: `Notes set (${valid.length})`, body };
}