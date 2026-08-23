"use client";

// ─── Custom Pomodoro engine — shared by /sessions and the dashboard FocusZone ───
// Full technique: work → short break, with an optional LONG break every N cycles.
// Last-used config persists to localStorage so the setup survives reloads.

import { useCallback, useEffect, useRef, useState } from "react";

export type PomoPhase = "work" | "break" | "long";

export interface PomoConfig {
  workMin: number;
  breakMin: number;
  longBreakMin: number;          // 0 = long break disabled
  cyclesBeforeLongBreak: number; // 0 = long break disabled
  autoAdvance: boolean;          // false → pause at each phase boundary
}

export const DEFAULT_POMO_CONFIG: PomoConfig = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
  autoAdvance: true,
};

export const BUILTIN_PRESETS: (PomoConfig & { label: string })[] = [
  { label: "25/5", workMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLongBreak: 4, autoAdvance: true },
  { label: "50/10", workMin: 50, breakMin: 10, longBreakMin: 20, cyclesBeforeLongBreak: 3, autoAdvance: true },
  { label: "90/15", workMin: 90, breakMin: 15, longBreakMin: 30, cyclesBeforeLongBreak: 2, autoAdvance: true },
];

const LS_KEY = "studymax.pomodoro.config";

export function clampConfig(c: Partial<PomoConfig>): PomoConfig {
  const d = { ...DEFAULT_POMO_CONFIG, ...c };
  return {
    workMin: Math.min(180, Math.max(1, Math.round(d.workMin) || 1)),
    breakMin: Math.min(60, Math.max(1, Math.round(d.breakMin) || 1)),
    longBreakMin: Math.min(90, Math.max(0, Math.round(d.longBreakMin) || 0)),
    cyclesBeforeLongBreak: Math.min(12, Math.max(0, Math.round(d.cyclesBeforeLongBreak) || 0)),
    autoAdvance: !!d.autoAdvance,
  };
}

export function loadLastConfig(): PomoConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return clampConfig({ ...DEFAULT_POMO_CONFIG, ...(JSON.parse(raw) as Partial<PomoConfig>) });
  } catch {
    return null;
  }
}

export function saveLastConfig(c: PomoConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export function phaseSeconds(phase: PomoPhase, c: PomoConfig): number {
  const min = phase === "work" ? c.workMin : phase === "break" ? c.breakMin : Math.max(1, c.longBreakMin);
  return min * 60;
}

export function beep(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.65);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* audio unavailable */
  }
}

export interface PomoSnapshot {
  workSeconds: number;
  cycles: number;
}

export interface PomodoroHandle {
  phase: PomoPhase;
  seconds: number;
  running: boolean;
  paused: boolean;
  active: boolean;
  cycles: number;
  workSeconds: number;
  config: PomoConfig;
  applyConfig: (partial: Partial<PomoConfig>, resetPhase?: boolean) => void;
  start: () => void;
  togglePause: () => void;
  skip: () => void;
  stop: () => PomoSnapshot;
}

export function usePomodoro(): PomodoroHandle {
  const [config, setConfigState] = useState<PomoConfig>(DEFAULT_POMO_CONFIG);
  const [phase, setPhase] = useState<PomoPhase>("work");
  const [seconds, setSeconds] = useState(DEFAULT_POMO_CONFIG.workMin * 60);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [workSeconds, setWorkSeconds] = useState(0);

  const engine = useRef({
    phase: "work" as PomoPhase,
    seconds: DEFAULT_POMO_CONFIG.workMin * 60,
    workSeconds: 0,
    cycles: 0,
  });
  // Ref mirrors written in event handlers / effects only — assigning
  // .current during render trips react-hooks refs-during-render.
  const cfgRef = useRef(config);
  const runningRef = useRef(false);
  useEffect(() => {
    cfgRef.current = config;
  }, [config]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Restore last-used config once on mount (localStorage is client-only).
  // rAF defers it past the effect's sync phase — silences
  // react-hooks/set-state-in-effect without changing behavior.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const last = loadLastConfig();
      if (last) {
        setConfigState(last);
        cfgRef.current = last;
        if (!runningRef.current) {
          engine.current.seconds = phaseSeconds("work", last);
          setSeconds(engine.current.seconds);
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tick loop — ref engine mutates, state mirrors it for render
  useEffect(() => {
    if (!running || paused) return;
    const iv = setInterval(() => {
      const r = engine.current;
      const cfg = cfgRef.current;
      r.seconds -= 1;
      if (r.phase === "work") {
        r.workSeconds += 1;
        setWorkSeconds(r.workSeconds);
      }
      if (r.seconds <= 0) {
        beep();
        if (r.phase === "work") {
          r.cycles += 1;
          setCycles(r.cycles);
          const longDue =
            cfg.cyclesBeforeLongBreak > 0 &&
            cfg.longBreakMin > 0 &&
            r.cycles % cfg.cyclesBeforeLongBreak === 0;
          r.phase = longDue ? "long" : "break";
        } else {
          r.phase = "work";
        }
        r.seconds = phaseSeconds(r.phase, cfg);
        setPhase(r.phase);
        if (!cfg.autoAdvance) setPaused(true);
      }
      setSeconds(Math.max(0, r.seconds));
    }, 1000);
    return () => clearInterval(iv);
  }, [running, paused]);

  const applyConfig = useCallback((partial: Partial<PomoConfig>, resetPhase = false) => {
    const next = clampConfig({ ...cfgRef.current, ...partial });
    setConfigState(next);
    cfgRef.current = next;
    if (!runningRef.current) {
      const r = engine.current;
      if (resetPhase) {
        r.phase = "work";
        setPhase("work");
      }
      r.seconds = phaseSeconds(r.phase, next);
      setSeconds(r.seconds);
    }
  }, []);

  const start = useCallback(() => {
    const cfg = cfgRef.current;
    const r = engine.current;
    r.phase = "work";
    r.seconds = phaseSeconds("work", cfg);
    r.workSeconds = 0;
    r.cycles = 0;
    setPhase("work");
    setSeconds(r.seconds);
    setWorkSeconds(0);
    setCycles(0);
    setRunning(true);
    setPaused(false);
    saveLastConfig(cfg);
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const skip = useCallback(() => {
    const cfg = cfgRef.current;
    const r = engine.current;
    // Skipping a work phase does NOT count a completed cycle → short break
    r.phase = r.phase === "work" ? "break" : "work";
    r.seconds = phaseSeconds(r.phase, cfg);
    setPhase(r.phase);
    setSeconds(r.seconds);
    setPaused(false);
  }, []);

  const stop = useCallback((): PomoSnapshot => {
    const cfg = cfgRef.current;
    const r = engine.current;
    const snap = { workSeconds: r.workSeconds, cycles: r.cycles };
    setRunning(false);
    setPaused(false);
    r.phase = "work";
    r.seconds = phaseSeconds("work", cfg);
    r.workSeconds = 0;
    r.cycles = 0;
    setPhase("work");
    setSeconds(r.seconds);
    setWorkSeconds(0);
    setCycles(0);
    return snap;
  }, []);

  return {
    phase,
    seconds,
    running,
    paused,
    active: running && !paused,
    cycles,
    workSeconds,
    config,
    applyConfig,
    start,
    togglePause,
    skip,
    stop,
  };
}
