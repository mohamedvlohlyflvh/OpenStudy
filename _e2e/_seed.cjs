/* E2E test seed — creates realistic data, prints ids, reversible via _unseed.cjs */
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const db = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:dev.db" }) });

const day = 86400000;
const now = Date.now();

(async () => {
  // ─── Subjects + Topics ───
  const math = await db.subject.create({
    data: { name: "Mathematics", description: "Analysis, algebra & problem sets", color: "#3B82F6", icon: "calculator" },
  });
  const bio = await db.subject.create({
    data: { name: "Biology", description: "Cells, genetics, evolution", color: "#10B981", icon: "dna" },
  });
  const hist = await db.subject.create({
    data: { name: "History", description: "Modern world history", color: "#F59E0B", icon: "landmark" },
  });
  const calc = await db.topic.create({ data: { subjectId: math.id, name: "Calculus", description: "Limits, derivatives, integrals" } });
  const linalg = await db.topic.create({ data: { subjectId: math.id, name: "Linear Algebra", description: "Vectors, matrices, eigenvalues" } });
  const cell = await db.topic.create({ data: { subjectId: bio.id, name: "Cell Biology", description: "Structure & function of cells" } });
  const ww2 = await db.topic.create({ data: { subjectId: hist.id, name: "World War II", description: "1939–1945" } });

  // ─── Tags ───
  const tagDefs = ["exam", "hard", "definition", "formula"];
  const tags = {};
  for (const name of tagDefs) {
    tags[name] = await db.tag.upsert({ where: { name }, create: { name }, update: {} });
  }

  // ─── Bundles + cards ───
  const b1 = await db.bundle.create({
    data: { name: "Calculus Formulas", description: "Derivatives & integrals cheat sheet", color: "#FACC15" },
  });
  const b2 = await db.bundle.create({
    data: { name: "Biology Terms", description: "Key terminology for the midterm", color: "#34D399" },
  });
  const b3 = await db.bundle.create({
    data: { name: "History Dates", description: "Timeline of major events", color: "#FB7185" },
  });

  const mkCard = (data) => db.flashcard.create({ data });

  // Bundle 1 — 8 cards: 4 due now, 2 scheduled future, 2 leeches
  const calcCards = [
    { bundleId: b1.id, topicId: calc.id, front: "d/dx [x^n] = ?", back: "**n · x^(n−1)** — the power rule.", nextReview: new Date(now - 2 * day), reviewCount: 5, intervalDays: 3, easeFactor: 2.6 },
    { bundleId: b1.id, topicId: calc.id, front: "∫ 1/x dx = ?", back: "ln|x| + C", nextReview: new Date(now - 1 * day), reviewCount: 3, intervalDays: 1, easeFactor: 2.5 },
    { bundleId: b1.id, topicId: calc.id, front: "Chain rule statement?", back: "d/dx f(g(x)) = **f'(g(x)) · g'(x)**", nextReview: new Date(now), reviewCount: 2, intervalDays: 0, easeFactor: 2.5 },
    { bundleId: b1.id, topicId: calc.id, front: "lim(x→0) sin(x)/x = ?", back: "1", nextReview: new Date(now), reviewCount: 1, intervalDays: 0, easeFactor: 2.5 },
    { bundleId: b1.id, topicId: calc.id, front: "∫ e^x dx = ?", back: "e^x + C", nextReview: new Date(now + 3 * day), reviewCount: 6, intervalDays: 8, easeFactor: 2.7 },
    { bundleId: b1.id, topicId: calc.id, front: "Product rule?", back: "(fg)' = f'g + fg'", nextReview: new Date(now + 7 * day), reviewCount: 4, intervalDays: 10, easeFactor: 2.6 },
    { bundleId: b1.id, topicId: calc.id, front: "d/dx [tan x] = ?", back: "sec²x", nextReview: new Date(now - 3 * day), reviewCount: 8, intervalDays: 1, easeFactor: 1.4, consecutiveAgain: 6, isLeech: true },
    { bundleId: b1.id, topicId: calc.id, front: "∫ sec²x dx = ?", back: "tan x + C", nextReview: new Date(now - 4 * day), reviewCount: 7, intervalDays: 1, easeFactor: 1.3, consecutiveAgain: 5, isLeech: true },
  ];
  const createdCalc = [];
  for (const c of calcCards) createdCalc.push(await mkCard(c));

  // Bundle 2 — 6 cards, all due, with tags
  const bioCards = [
    { bundleId: b2.id, topicId: cell.id, front: "What is the powerhouse of the cell?", back: "The **mitochondrion** — site of aerobic respiration (ATP).", nextReview: new Date(now - 1 * day), reviewCount: 2, intervalDays: 1, easeFactor: 2.5 },
    { bundleId: b2.id, topicId: cell.id, front: "Function of ribosomes?", back: "Protein synthesis (translation of mRNA).", nextReview: new Date(now), reviewCount: 1, intervalDays: 0, easeFactor: 2.5 },
    { bundleId: b2.id, topicId: cell.id, front: "Define osmosis.", back: "Movement of water across a semi-permeable membrane from low to high solute concentration.", nextReview: new Date(now), reviewCount: 3, intervalDays: 2, easeFactor: 2.4 },
    { bundleId: b2.id, topicId: cell.id, front: "Difference: prokaryote vs eukaryote?", back: "Eukaryotes have a **membrane-bound nucleus**; prokaryotes do not.", nextReview: new Date(now - 2 * day), reviewCount: 4, intervalDays: 2, easeFactor: 2.5 },
    { bundleId: b2.id, topicId: cell.id, front: "What does the Golgi apparatus do?", back: "Modifies, packages and ships proteins/lipids.", nextReview: new Date(now + 1 * day), reviewCount: 2, intervalDays: 4, easeFactor: 2.6 },
    { bundleId: b2.id, topicId: cell.id, front: "Phases of mitosis (in order)?", back: "Prophase → Metaphase → Anaphase → Telophase (**PMAT**).", nextReview: new Date(now), reviewCount: 0, intervalDays: 0, easeFactor: 2.5 },
  ];
  const createdBio = [];
  for (const c of bioCards) createdBio.push(await mkCard(c));

  // Bundle 3 — 4 cards
  const histCards = [
    { bundleId: b3.id, topicId: ww2.id, front: "When did WWII start in Europe?", back: "**1 September 1939** — Germany invaded Poland.", nextReview: new Date(now - 1 * day), reviewCount: 2, intervalDays: 1, easeFactor: 2.5 },
    { bundleId: b3.id, topicId: ww2.id, front: "D-Day date and codename?", back: "6 June 1944 — Operation **Overlord** (Normandy landings).", nextReview: new Date(now), reviewCount: 1, intervalDays: 0, easeFactor: 2.5 },
    { bundleId: b3.id, topicId: ww2.id, front: "When did Germany surrender?", back: "8 May 1945 (V-E Day).", nextReview: new Date(now + 2 * day), reviewCount: 3, intervalDays: 5, easeFactor: 2.6 },
    { bundleId: b3.id, topicId: ww2.id, front: "Atomic bombs: which two cities?", back: "Hiroshima (6 Aug 1945) and Nagasaki (9 Aug 1945).", nextReview: new Date(now), reviewCount: 0, intervalDays: 0, easeFactor: 2.5 },
  ];
  const createdHist = [];
  for (const c of histCards) createdHist.push(await mkCard(c));

  // Card tags
  await db.cardTag.createMany({
    data: [
      { cardId: createdCalc[0].id, tagId: tags.formula.id },
      { cardId: createdCalc[1].id, tagId: tags.formula.id },
      { cardId: createdCalc[2].id, tagId: tags.exam.id },
      { cardId: createdCalc[6].id, tagId: tags.hard.id },
      { cardId: createdCalc[7].id, tagId: tags.hard.id },
      { cardId: createdCalc[7].id, tagId: tags.formula.id },
      { cardId: createdBio[0].id, tagId: tags.definition.id },
      { cardId: createdBio[2].id, tagId: tags.definition.id },
      { cardId: createdBio[2].id, tagId: tags.exam.id },
      { cardId: createdBio[5].id, tagId: tags.exam.id },
      { cardId: createdHist[1].id, tagId: tags.exam.id },
    ],
  });

  // A couple of topic-only cards (no bundle) — exercises the topic path
  await mkCard({ topicId: linalg.id, subjectId: math.id, front: "What is an eigenvalue?", back: "λ such that **Av = λv** for a non-zero vector v.", nextReview: new Date(now), reviewCount: 1, intervalDays: 0, easeFactor: 2.5 });
  await mkCard({ topicId: linalg.id, subjectId: math.id, front: "Determinant of a 2×2 [[a,b],[c,d]]?", back: "ad − bc", nextReview: new Date(now - 1 * day), reviewCount: 2, intervalDays: 1, easeFactor: 2.4 });

  // ─── Notes (markdown content) ───
  const n1 = await db.note.create({
    data: {
      topicId: calc.id,
      title: "Integration techniques",
      isPinned: true,
      content: "# Integration techniques\n\n## Substitution\nUse when you see a function **and its derivative**:\n\n- Let `u = g(x)`\n- Then `du = g'(x) dx`\n\n## Integration by parts\n`∫ u dv = uv − ∫ v du`\n\n> Pick u by **LIATE**: Log, Inverse trig, Algebraic, Trig, Exponential.\n\n1. Differentiate u\n2. Integrate dv\n3. Apply the formula",
    },
  });
  const n2 = await db.note.create({
    data: {
      topicId: cell.id,
      title: "Cell membrane summary",
      content: "## Structure\nThe membrane is a **phospholipid bilayer** with embedded proteins.\n\n- Hydrophilic heads face outward\n- Hydrophobic tails face inward\n\n### Transport\n| Type | Energy? | Example |\n| Passive | No | Osmosis |\n| Active | Yes (ATP) | Na+/K+ pump |",
    },
  });
  const n3 = await db.note.create({
    data: {
      topicId: ww2.id,
      title: "WWII turning points",
      content: "# Turning points\n\n1. **Stalingrad** (1942–43) — eastern front flips\n2. **Midway** (1942) — Pacific naval superiority\n3. **El Alamein** (1942) — North Africa\n4. **D-Day** (1944) — western front opens\n\n*Exam focus: dates + why each mattered.*",
    },
  });

  // Note tags
  await db.noteTag.createMany({
    data: [
      { noteId: n1.id, tagId: tags.formula.id },
      { noteId: n1.id, tagId: tags.exam.id },
      { noteId: n2.id, tagId: tags.definition.id },
      { noteId: n3.id, tagId: tags.exam.id },
    ],
  });

  // ─── Study sessions ───
  await db.studySession.createMany({
    data: [
      { subjectId: math.id, topicId: calc.id, title: "Derivatives drill", durationMin: 45, completed: true, startedAt: new Date(now - 1 * day), endedAt: new Date(now - 1 * day + 45 * 60000), notes: "Power rule + chain rule" },
      { subjectId: bio.id, topicId: cell.id, title: "Organelles review", durationMin: 30, completed: true, startedAt: new Date(now - 2 * day), endedAt: new Date(now - 2 * day + 30 * 60000) },
      { subjectId: hist.id, topicId: ww2.id, title: "Timeline memorization", durationMin: 25, completed: false, startedAt: new Date(now - 3 * day) },
      { subjectId: math.id, topicId: linalg.id, title: "Eigenvalues intro", durationMin: 60, completed: true, startedAt: new Date(now - 5 * day), endedAt: new Date(now - 5 * day + 60 * 60000) },
    ],
  });

  // ─── Review logs (last 14 days for heatmap) ───
  const logs = [];
  const allCards = [...createdCalc, ...createdBio, ...createdHist];
  for (let d = 13; d >= 0; d--) {
    const count = d % 3 === 0 ? 4 : d % 2 === 0 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const card = allCards[(d * 3 + i) % allCards.length];
      logs.push({
        flashcardId: card.id,
        quality: [3, 5, 2, 3, 5, 0][(d + i) % 6],
        reviewedAt: new Date(now - d * day - i * 3600000),
      });
    }
  }
  await db.reviewLog.createMany({ data: logs });

  console.log(JSON.stringify({
    subjects: [math.id, bio.id, hist.id],
    bundles: [b1.id, b2.id, b3.id],
    cards: allCards.length + 2,
    notes: [n1.id, n2.id, n3.id],
  }));
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
