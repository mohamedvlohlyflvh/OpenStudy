/* Seed realistic data into Dexie/IndexedDB via a real browser page.
   Mirrors the old Prisma _seed.cjs shape: subjects/topics/bundles/cards
   (due + future + leeches + tags), notes, sessions, review logs. */
const { chromium } = require("playwright");

const day = 86400000;
const now = Date.now();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  const summary = await page.evaluate(({ day, now }) => {
    const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("studymax");
      req.onerror = () => reject("open failed");
      req.onsuccess = () => {
        const idb = req.result;
        idb.close();
        // Use the app's own Dexie instance for correct schema handling
        const w = window;
        if (!w.indexedDB) return reject("no idb");
        // Write through raw IndexedDB in Dexie's expected shape
        const open = indexedDB.open("studymax");
        open.onsuccess = () => {
          const d = open.result;
          const put = (store, items) =>
            new Promise((res, rej) => {
              const tx = d.transaction(store, "readwrite");
              const os = tx.objectStore(store);
              for (const it of items) os.put(it);
              tx.oncomplete = res;
              tx.onerror = () => rej(tx.error);
            });
          (async () => {
            // Subjects
            const math = { id: uid(), name: "Mathematics", description: "Analysis, algebra & problem sets", color: "#3B82F6", icon: "calculator", createdAt: new Date(now - 30 * day), updatedAt: new Date(now - day) };
            const bio = { id: uid(), name: "Biology", description: "Cells, genetics, evolution", color: "#10B981", icon: "dna", createdAt: new Date(now - 25 * day), updatedAt: new Date(now - day) };
            const hist = { id: uid(), name: "History", description: "Modern world history", color: "#F59E0B", icon: "landmark", createdAt: new Date(now - 20 * day), updatedAt: new Date(now - day) };
            await put("subjects", [math, bio, hist]);

            // Topics
            const calc = { id: uid(), subjectId: math.id, name: "Calculus", description: "Limits, derivatives, integrals", order: 0, createdAt: new Date(now - 20 * day), updatedAt: new Date(now - day) };
            const linalg = { id: uid(), subjectId: math.id, name: "Linear Algebra", description: "Vectors, matrices, eigenvalues", order: 1, createdAt: new Date(now - 18 * day), updatedAt: new Date(now - day) };
            const cell = { id: uid(), subjectId: bio.id, name: "Cell Biology", description: "Structure & function of cells", order: 0, createdAt: new Date(now - 15 * day), updatedAt: new Date(now - day) };
            const ww2 = { id: uid(), subjectId: hist.id, name: "World War II", description: "1939–1945", order: 0, createdAt: new Date(now - 12 * day), updatedAt: new Date(now - day) };
            await put("topics", [calc, linalg, cell, ww2]);

            // Tags
            const mkTag = (n) => ({ id: uid(), name: n });
            const tags = { exam: mkTag("exam"), hard: mkTag("hard"), definition: mkTag("definition"), formula: mkTag("formula") };
            await put("tags", Object.values(tags));

            // Bundles
            const b1 = { id: uid(), name: "Calculus Formulas", description: "Derivatives & integrals cheat sheet", color: "#FACC15", createdAt: new Date(now - 14 * day), updatedAt: new Date(now - day) };
            const b2 = { id: uid(), name: "Biology Terms", description: "Key terminology for the midterm", color: "#34D399", createdAt: new Date(now - 10 * day), updatedAt: new Date(now - day) };
            const b3 = { id: uid(), name: "History Dates", description: "Timeline of major events", color: "#FB7185", createdAt: new Date(now - 8 * day), updatedAt: new Date(now - day) };
            await put("bundles", [b1, b2, b3]);

            // Flashcards
            let n = 0;
            const card = (o) => ({ id: uid(), front: o.front, back: o.back, topicId: o.topicId ?? null, subjectId: o.subjectId ?? null, bundleId: o.bundleId ?? null, nextReview: new Date(o.nextReview), reviewCount: o.reviewCount ?? 0, intervalDays: o.intervalDays ?? 0, easeFactor: o.easeFactor ?? 2.5, consecutiveAgain: o.consecutiveAgain ?? 0, isLeech: o.isLeech ?? false, suspended: false, createdAt: new Date(now - 12 * day), updatedAt: new Date(now - day), ord: n++ });
            const cards = [
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "d/dx [x^n] = ?", back: "**n · x^(n−1)** — the power rule.", nextReview: now - 2 * day, reviewCount: 5, intervalDays: 3, easeFactor: 2.6 }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "∫ 1/x dx = ?", back: "ln|x| + C", nextReview: now - day, reviewCount: 3, intervalDays: 1 }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "Chain rule statement?", back: "d/dx f(g(x)) = **f'(g(x)) · g'(x)**", nextReview: now, reviewCount: 2 }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "lim(x→0) sin(x)/x = ?", back: "1", nextReview: now }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "∫ e^x dx = ?", back: "e^x + C", nextReview: now + 3 * day, reviewCount: 6, intervalDays: 8, easeFactor: 2.7 }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "Product rule?", back: "(fg)' = f'g + fg'", nextReview: now + 7 * day, reviewCount: 4, intervalDays: 10, easeFactor: 2.6 }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "d/dx [tan x] = ?", back: "sec²x", nextReview: now - 3 * day, reviewCount: 8, easeFactor: 1.4, consecutiveAgain: 6, isLeech: true }),
              card({ bundleId: b1.id, topicId: calc.id, subjectId: math.id, front: "∫ sec²x dx = ?", back: "tan x + C", nextReview: now - 4 * day, reviewCount: 7, easeFactor: 1.3, consecutiveAgain: 5, isLeech: true }),
              card({ bundleId: b2.id, topicId: cell.id, subjectId: bio.id, front: "What is the powerhouse of the cell?", back: "The **mitochondrion** — site of aerobic respiration (ATP).", nextReview: now - day, reviewCount: 2, intervalDays: 1 }),
              card({ bundleId: b2.id, topicId: cell.id, subjectId: bio.id, front: "Function of ribosomes?", back: "Protein synthesis (translation of mRNA).", nextReview: now }),
              card({ bundleId: b2.id, topicId: cell.id, subjectId: bio.id, front: "Define osmosis.", back: "Movement of water across a semi-permeable membrane from low to high solute concentration.", nextReview: now, reviewCount: 3, intervalDays: 2, easeFactor: 2.4 }),
              card({ bundleId: b2.id, topicId: cell.id, subjectId: bio.id, front: "Difference: prokaryote vs eukaryote?", back: "Eukaryotes have a **membrane-bound nucleus**; prokaryotes do not.", nextReview: now - 2 * day, reviewCount: 4, intervalDays: 2 }),
              card({ bundleId: b2.id, topicId: cell.id, subjectId: bio.id, front: "What does the Golgi apparatus do?", back: "Modifies, packages and ships proteins/lipids.", nextReview: now + day, reviewCount: 2, intervalDays: 4, easeFactor: 2.6 }),
              card({ bundleId: b2.id, topicId: cell.id, subjectId: bio.id, front: "Phases of mitosis (in order)?", back: "Prophase → Metaphase → Anaphase → Telophase (**PMAT**).", nextReview: now }),
              card({ bundleId: b3.id, topicId: ww2.id, subjectId: hist.id, front: "When did WWII start in Europe?", back: "**1 September 1939** — Germany invaded Poland.", nextReview: now - day, reviewCount: 2, intervalDays: 1 }),
              card({ bundleId: b3.id, topicId: ww2.id, subjectId: hist.id, front: "D-Day date and codename?", back: "6 June 1944 — Operation **Overlord** (Normandy landings).", nextReview: now, reviewCount: 1 }),
              card({ bundleId: b3.id, topicId: ww2.id, subjectId: hist.id, front: "When did Germany surrender?", back: "8 May 1945 (V-E Day).", nextReview: now + 2 * day, reviewCount: 3, intervalDays: 5, easeFactor: 2.6 }),
              card({ bundleId: b3.id, topicId: ww2.id, subjectId: hist.id, front: "Atomic bombs: which two cities?", back: "Hiroshima (6 Aug 1945) and Nagasaki (9 Aug 1945).", nextReview: now }),
              card({ topicId: linalg.id, subjectId: math.id, front: "What is an eigenvalue?", back: "λ such that **Av = λv** for a non-zero vector v.", nextReview: now, reviewCount: 1 }),
              card({ topicId: linalg.id, subjectId: math.id, front: "Determinant of a 2×2 [[a,b],[c,d]]?", back: "ad − bc", nextReview: now - day, reviewCount: 2, intervalDays: 1, easeFactor: 2.4 }),
            ];
            await put("flashcards", cards);

            // Card tags
            const ct = [];
            const link = (c, t) => ct.push({ cardId: c.id, tagId: t.id });
            link(cards[0], tags.formula); link(cards[1], tags.formula); link(cards[2], tags.exam);
            link(cards[6], tags.hard); link(cards[7], tags.hard); link(cards[7], tags.formula);
            link(cards[8], tags.definition); link(cards[10], tags.definition); link(cards[10], tags.exam);
            link(cards[13], tags.exam); link(cards[15], tags.exam);
            await put("cardTags", ct);

            // Notes
            const note = (o) => ({ id: uid(), topicId: o.topicId, title: o.title, content: o.content, isPinned: !!o.pinned, createdAt: new Date(now - 7 * day), updatedAt: new Date(now - day) });
            const n1 = note({ topicId: calc.id, pinned: true, title: "Integration techniques", content: "# Integration techniques\n\n## Substitution\nUse when you see a function **and its derivative**:\n\n- Let `u = g(x)`\n- Then `du = g'(x) dx`\n\n## Integration by parts\n`∫ u dv = uv − ∫ v du`\n\n> Pick u by **LIATE**: Log, Inverse trig, Algebraic, Trig, Exponential.\n\n1. Differentiate u\n2. Integrate dv\n3. Apply the formula" });
            const n2 = note({ topicId: cell.id, title: "Cell membrane summary", content: "## Structure\nThe membrane is a **phospholipid bilayer** with embedded proteins.\n\n- Hydrophilic heads face outward\n- Hydrophobic tails face inward" });
            const n3 = note({ topicId: ww2.id, title: "WWII turning points", content: "# Turning points\n\n1. **Stalingrad** (1942–43) — eastern front flips\n2. **Midway** (1942) — Pacific naval superiority\n3. **El Alamein** (1942) — North Africa\n4. **D-Day** (1944) — western front opens" });
            await put("notes", [n1, n2, n3]);
            await put("noteTags", [
              { noteId: n1.id, tagId: tags.formula.id }, { noteId: n1.id, tagId: tags.exam.id },
              { noteId: n2.id, tagId: tags.definition.id }, { noteId: n3.id, tagId: tags.exam.id },
            ]);

            // Study sessions — spread over the week so weekly bars show variety
            const sess = (title, subjectId, topicId, min, daysAgo, completed) => ({ id: uid(), subjectId, topicId, title, durationMin: min, completed, startedAt: new Date(now - daysAgo * day), endedAt: completed ? new Date(now - daysAgo * day + min * 60000) : undefined, notes: null });
            await put("studySessions", [
              sess("Derivatives drill", math.id, calc.id, 45, 0, true),
              sess("Organelles review", bio.id, cell.id, 30, 1, true),
              sess("Timeline memorization", hist.id, ww2.id, 25, 2, true),
              sess("Eigenvalues intro", math.id, linalg.id, 60, 3, true),
              sess("Integral practice", math.id, calc.id, 50, 4, true),
              sess("Membrane transport", bio.id, cell.id, 35, 5, true),
              sess("D-Day timeline", hist.id, ww2.id, 40, 6, true),
              sess("Power rule warmup", math.id, calc.id, 20, 0, true),
            ]);

            // Review logs — today + past 13 days (feeds cardsReviewedToday + streak)
            const logs = [];
            for (let d = 13; d >= 1; d--) {
              const count = d % 3 === 0 ? 4 : d % 2 === 0 ? 2 : 1;
              for (let i = 0; i < count; i++) {
                logs.push({ id: uid(), flashcardId: cards[(d * 3 + i) % cards.length].id, quality: [3, 5, 2, 3, 5, 0][(d + i) % 6], reviewedAt: new Date(now - d * day - i * 3600000) });
              }
            }
            for (let i = 0; i < 12; i++) {
              logs.push({ id: uid(), flashcardId: cards[i].id, quality: 4, reviewedAt: new Date(now - i * 1800000) });
            }
            await put("reviewLogs", logs);

            return resolve({
              subjects: 3, topics: 4, bundles: 3, cards: cards.length,
              notes: 3, sessions: 8, reviewLogs: logs.length,
              names: ["Mathematics", "Biology", "History", "Calculus Formulas", "Biology Terms", "History Dates"],
            });
          })().catch(reject);
        };
      };
    });
  }, { day, now });

  console.log(JSON.stringify(summary));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
