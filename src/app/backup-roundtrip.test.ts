import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  createSubject,
  createTopic,
  createFlashcard,
  createStudySession,
  createGoal,
  reviewFlashcardWithLog,
  exportAllData,
  importAllData,
} from "@/app/actions";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seed() {
  const subject = await createSubject({ name: "Biology", color: "#00ff00", icon: "leaf" });
  const topic = await createTopic({ subjectId: subject.id, name: "Cells", order: 0 });
  const cardA = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "Q1", back: "A1" });
  const cardB = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "Q2", back: "A2" });
  // Lapse on A (consecutiveAgain=1 + review log), pass on B.
  await reviewFlashcardWithLog(cardA.id, 0);
  await reviewFlashcardWithLog(cardB.id, 5);
  // Distinct lastReview so the test can tell it wasn't stamped from nextReview.
  const distinctPast = new Date("2026-01-15T10:00:00Z");
  await db.flashcards.update(cardB.id, { lastReview: distinctPast });
  const session = await createStudySession({
    subjectId: subject.id,
    topicId: topic.id,
    title: "Morning review",
    durationMin: 25,
    startedAt: new Date("2026-09-06T08:00:00Z"),
  });
  // Done + repeating goal — the state the old import bounced to backlog.
  const goal = await createGoal({ title: "Finish cell chapter", horizon: "regular", repeat: "weekly" });
  await db.goals.update(goal.id, {
    status: "done",
    order: 0,
    completedAt: new Date("2026-09-05T12:00:00Z"),
  });
  return { subject, topic, cardA, cardB, session, goal, distinctPast };
}

describe("backup round-trip", () => {
  it("preserves scheduling, re-links sessions, re-attaches logs, keeps done goals done", async () => {
    const seedData = await seed();
    const json = await exportAllData();

    await db.delete();
    await db.open();
    await importAllData(json);

    // Cards restored with scheduling intact
    const cards = await db.flashcards.toArray();
    expect(cards).toHaveLength(2);
    const restoredB = cards.find((c) => c.front === "Q2")!;
    expect(restoredB.reviewCount).toBeGreaterThan(0);
    expect(new Date(restoredB.lastReview!).getTime()).toBe(seedData.distinctPast.getTime());
    expect(new Date(restoredB.lastReview!).getTime()).not.toBe(
      new Date(restoredB.nextReview).getTime()
    );
    const restoredA = cards.find((c) => c.front === "Q1")!;
    expect(restoredA.consecutiveAgain).toBe(1);

    // Session re-linked to the new subject/topic by name
    const sessions = await db.studySessions.toArray();
    expect(sessions).toHaveLength(1);
    const restoredSubject = await db.subjects.where("name").equals("Biology").first();
    expect(restoredSubject).toBeDefined();
    expect(sessions[0].subjectId).toBe(restoredSubject!.id);
    expect(sessions[0].topicId).not.toBeNull();
    expect(sessions[0].endedAt).toBeDefined();

    // Review logs re-attached to real card ids (not "imported")
    const logs = await db.reviewLogs.toArray();
    expect(logs.length).toBeGreaterThanOrEqual(2);
    const cardIds = new Set(cards.map((c) => c.id));
    for (const log of logs) {
      expect(cardIds.has(log.flashcardId)).toBe(true);
    }

    // Done + repeating goal stays done
    const goals = await db.goals.toArray();
    expect(goals).toHaveLength(1);
    expect(goals[0].status).toBe("done");
    expect(goals[0].completedAt).toBeDefined();
  });

  it("still imports a v1 backup (no scheduling, no logs)", async () => {
    await seed();
    const full = JSON.parse(await exportAllData());
    delete full.reviewLogs;
    for (const s of full.subjects) {
      for (const t of s.topics) {
        for (const c of t.flashcards) {
          delete c.easeFactor;
          delete c.intervalDays;
          delete c.nextReview;
          delete c.lastReview;
          delete c.reviewCount;
          delete c.consecutiveAgain;
          delete c.isLeech;
        }
      }
    }
    full.version = 1;

    await db.delete();
    await db.open();
    await importAllData(JSON.stringify(full));

    expect(await db.flashcards.count()).toBe(2);
    expect(await db.studySessions.count()).toBe(1);
  });

  it("rejects backups newer than the app supports", async () => {
    await expect(importAllData(JSON.stringify({ version: 99, subjects: [] }))).rejects.toThrow();
    await expect(importAllData("not json")).rejects.toThrow();
  });
});
