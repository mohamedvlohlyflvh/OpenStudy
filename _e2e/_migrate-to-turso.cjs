/* Push Prisma migration SQL to remote Turso DB, then copy local dev.db rows over.
   Reads TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from .env.local */
const fs = require("fs");
const path = require("path");

// parse .env.local
const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
  console.error("MISSING TURSO env vars in .env.local");
  process.exit(1);
}
console.log("Remote URL:", env.TURSO_DATABASE_URL);

const { createClient } = require("@libsql/client");

(async () => {
  const remote = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

  // ── 1. Apply migrations in order ──
  const migDir = path.join(__dirname, "..", "prisma", "migrations");
  const migs = fs.readdirSync(migDir).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const mig of migs) {
    const sql = fs.readFileSync(path.join(migDir, mig, "migration.sql"), "utf8");
    // split on semicolons at statement level (no semicolons inside strings in these files)
    const stmts = sql.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of stmts) {
      try {
        await remote.execute(stmt);
      } catch (e) {
        // ignore "already exists" for idempotency
        if (!/already exists/i.test(e.message)) throw e;
      }
    }
    console.log("Applied migration:", mig, `(${stmts.length} statements)`);
  }

  // ── 2. Copy data from local dev.db via Prisma clients ──
  const { PrismaClient } = require("@prisma/client");
  const { PrismaLibSql } = require("@prisma/adapter-libsql");
  const local = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:dev.db" }) });
  const remoteDb = new PrismaClient({ adapter: new PrismaLibSql({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }) });

  const subjects = await local.subject.findMany();
  for (const s of subjects) await remoteDb.subject.create({ data: s });
  console.log("Copied subjects:", subjects.length);

  const topics = await local.topic.findMany();
  for (const t of topics) await remoteDb.topic.create({ data: t });
  console.log("Copied topics:", topics.length);

  const bundles = await local.bundle.findMany();
  for (const b of bundles) await remoteDb.bundle.create({ data: b });
  console.log("Copied bundles:", bundles.length);

  const cards = await local.flashcard.findMany();
  for (const c of cards) await remoteDb.flashcard.create({ data: c });
  console.log("Copied flashcards:", cards.length);

  const notes = await local.note.findMany();
  for (const n of notes) await remoteDb.note.create({ data: n });
  console.log("Copied notes:", notes.length);

  const sessions = await local.studySession.findMany();
  for (const s of sessions) await remoteDb.studySession.create({ data: s });
  console.log("Copied sessions:", sessions.length);

  const tags = await local.tag.findMany();
  for (const t of tags) await remoteDb.tag.create({ data: t });
  console.log("Copied tags:", tags.length);

  // ── 3. Verify remote counts ──
  const [rs, rt, rb, rc, rn, rsess] = await Promise.all([
    remoteDb.subject.count(), remoteDb.topic.count(), remoteDb.bundle.count(),
    remoteDb.flashcard.count(), remoteDb.note.count(), remoteDb.studySession.count(),
  ]);
  console.log("REMOTE COUNTS:", JSON.stringify({ subjects: rs, topics: rt, bundles: rb, cards: rc, notes: rn, sessions: rsess }));

  await local.$disconnect();
  await remoteDb.$disconnect();
  console.log("MIGRATION COMPLETE");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
