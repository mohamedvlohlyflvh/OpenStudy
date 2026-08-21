/* Removes E2E seed data BY NAME (id-independent). User's own data untouched. */
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const db = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:dev.db" }) });

(async () => {
  // notes by seeded titles
  await db.note.deleteMany({ where: { title: { in: ["Integration techniques", "Cell membrane summary", "WWII turning points"] } } });
  // sessions by seeded titles
  await db.studySession.deleteMany({ where: { title: { in: ["Derivatives drill", "Organelles review", "Timeline memorization", "Eigenvalues intro"] } } });
  // subjects by seeded names (cascades topics -> their notes/flashcards)
  await db.subject.deleteMany({ where: { name: { in: ["Mathematics", "Biology", "History"] } } });
  // bundles by seeded names
  await db.bundle.deleteMany({ where: { name: { in: ["Calculus Formulas", "Biology Terms", "History Dates"] } } });
  // orphaned flashcards (no bundle, no topic) left from cascade SetNull
  await db.flashcard.deleteMany({ where: { bundleId: null, topicId: null } });
  // orphaned seed tags
  await db.tag.deleteMany({ where: { name: { in: ["exam", "hard", "definition", "formula"] }, notes: { none: {} }, cards: { none: {} } } });

  const [subjects, topics, bundles, cards, notes, sessions, tags] = await Promise.all([
    db.subject.count(), db.topic.count(), db.bundle.count(),
    db.flashcard.count(), db.note.count(), db.studySession.count(), db.tag.count(),
  ]);
  console.log("AFTER UNSEED:", JSON.stringify({ subjects, topics, bundles, cards, notes, sessions, tags }));
  const b = await db.bundle.findMany({ select: { id: true, name: true } });
  console.log("remaining bundles:", JSON.stringify(b));
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
