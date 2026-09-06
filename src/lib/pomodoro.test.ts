import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_POMO_CONFIG,
  deriveState,
  getActivePomo,
  pausePomoSession,
  resumePomoSession,
  setPomoMeta,
  skipPomoPhase,
  startPomoSession,
  stopPomoSession,
  syncPomoEngine,
} from "@/lib/pomodoro";

// The engine is wall-clock driven — fake timers make phase math instant.
const FAST: typeof DEFAULT_POMO_CONFIG = {
  workMin: 1,
  breakMin: 1,
  longBreakMin: 2,
  cyclesBeforeLongBreak: 2,
  autoAdvance: true,
};

describe("global pomodoro engine (ghost-session fix)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    // Ensure no session carries between tests.
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    if (getActivePomo()) stopPomoSession();
  });

  it("persists a running session to localStorage", () => {
    setPomoMeta({ title: "Calc", subjectId: "s1" });
    startPomoSession({ config: FAST });
    const stored = getActivePomo();
    expect(stored).not.toBeNull();
    expect(stored!.phase).toBe("work");
    expect(stored!.title).toBe("Calc");
    expect(stored!.subjectId).toBe("s1");
    expect(typeof stored!.startedAt).toBe("number");
  });

  it("fast-forwards a stale session across the phase boundary (tab was closed)", () => {
    startPomoSession({ config: FAST }); // work starts at T0
    const started = getActivePomo()!;
    // Simulate: no ticks for 90s (all tabs closed), now 70s into the break.
    vi.setSystemTime(new Date(started.startedAt + 90_000));
    const d = deriveState(started, Date.now());
    expect(d.phase).toBe("break");
    expect(d.cycles).toBe(1);
    expect(d.workSeconds).toBe(60);
    expect(d.seconds).toBe(30);
  });

  it("completes full cycles into the long break with autoAdvance", () => {
    startPomoSession({ config: FAST });
    const s = getActivePomo()!;
    // After work(60)+break(60)+work(60)+break(60) the 2nd cycle is done at
    // t=180 → LONG break (2 min) runs 180→300. At t=240: 60s left.
    vi.setSystemTime(new Date(s.startedAt + 240_000));
    const d = deriveState(s, Date.now());
    expect(d.phase).toBe("long");
    expect(d.cycles).toBe(2);
    expect(d.workSeconds).toBe(120);
    expect(d.seconds).toBe(60);
  });

  it("pause + resume preserves the remaining phase time", () => {
    startPomoSession({ config: FAST });
    vi.advanceTimersByTime(30_000); // 30s into the 60s work phase
    pausePomoSession();
    vi.advanceTimersByTime(600_000); // an hour of nothing
    expect(getActivePomo()!.paused).toBe(true);
    resumePomoSession();
    vi.advanceTimersByTime(10_000);
    const d = deriveState(getActivePomo()!, Date.now());
    expect(d.phase).toBe("work");
    expect(d.seconds).toBe(20); // 60 - 30 - 10
  });

  it("skip moves work -> break without counting the cycle", () => {
    startPomoSession({ config: FAST });
    skipPomoPhase();
    const d = deriveState(getActivePomo()!, Date.now());
    expect(d.phase).toBe("break");
    expect(d.cycles).toBe(0);
    skipPomoPhase();
    const d2 = deriveState(getActivePomo()!, Date.now());
    expect(d2.phase).toBe("work");
    expect(d2.cycles).toBe(0);
  });

  it("stop clears the persisted session and returns the true start", () => {
    setPomoMeta({ title: "Bio", subjectId: "s9" });
    startPomoSession({ config: FAST });
    const startedAt = getActivePomo()!.startedAt;
    vi.advanceTimersByTime(45_000);
    const snap = stopPomoSession()!;
    expect(snap.startedAt).toBe(startedAt);
    expect(snap.title).toBe("Bio");
    expect(snap.subjectId).toBe("s9");
    expect(getActivePomo()).toBeNull();
  });

  it("autoAdvance=false parks at a boundary crossed while closed; resume starts next phase", () => {
    const cfg = { ...FAST, autoAdvance: false };
    startPomoSession({ config: cfg });
    const s = getActivePomo()!;
    vi.setSystemTime(new Date(s.startedAt + 61_000)); // just past the boundary
    // deriveState reports the crossed boundary (new phase, 0s left).
    const d = deriveState(s, Date.now());
    expect(d.phase).toBe("break");
    expect(d.seconds).toBe(0);
    // Simulate: every tab closed (hard kill) — the in-memory engine dies but
    // the persisted document survives, still at its last-persisted state.
    const docRaw = localStorage.getItem("openstudy.pomodoro.active")!;
    stopPomoSession();
    localStorage.setItem("openstudy.pomodoro.active", docRaw);
    syncPomoEngine(); // what the first consumer mount does
    const re = getActivePomo()!;
    expect(re.paused).toBe(true); // parked at the boundary, resumable
    expect(re.phase).toBe("break");
    // Resume: the NEXT phase (work) starts at full duration, never negative.
    resumePomoSession();
    const after = deriveState(getActivePomo()!, Date.now());
    expect(after.phase).toBe("work");
    expect(after.seconds).toBe(60);
  });
});
