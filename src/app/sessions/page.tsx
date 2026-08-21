"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Play, Pause, Square, Clock, Timer, Trash2 } from "lucide-react";
import { Button, Badge, EmptyState, Input, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RevealHeading } from "@/components/reveal-heading";
import { getStudySessions, createStudySession, deleteStudySession, getSubjects } from "@/app/actions";
import { formatDuration, formatDate } from "@/lib/utils";

type Session = Awaited<ReturnType<typeof getStudySessions>>[number];
type Subject = Awaited<ReturnType<typeof getSubjects>>[number];

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartedAtRef = useRef<Date | null>(null);

  const [, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([getStudySessions(), getSubjects()]).then(([s, sub]) => {
      setSessions(s);
      setSubjects(sub);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (timerRunning && !timerPaused) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, timerPaused]);

  const startTimer = () => {
    if (!sessionTitle.trim()) return;
    setTimerSeconds(0);
    setTimerRunning(true);
    setTimerPaused(false);
    timerStartedAtRef.current = new Date();
  };

  const pauseTimer = () => {
    setTimerPaused(true);
  };

  const resumeTimer = () => {
    setTimerPaused(false);
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setTimerPaused(false);
    const seconds = timerSeconds;
    const startedAt = timerStartedAtRef.current;
    timerStartedAtRef.current = null;
    if (seconds < 3) return; // ignore accidental taps
    const duration = Math.max(1, Math.round(seconds / 60));

    startTransition(async () => {
      const session = await createStudySession({
        subjectId: selectedSubjectId || undefined,
        title: sessionTitle.trim(),
        durationMin: duration,
        completed: true,
        startedAt: startedAt ?? undefined,
      });
      setSessions((prev) => [
        {
          ...session,
          subject: subjects.find((s) => s.id === selectedSubjectId) ?? null,
          topic: null,
        },
        ...prev,
      ]);
      setSessionTitle("");
      setSelectedSubjectId("");
      setTimerSeconds(0);
    });
  };

  const formatTimer = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("DELETE THIS SESSION?")) return;
    await deleteStudySession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const totalMinutes = sessions.reduce((acc, s) => acc + s.durationMin, 0);

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-16">
        <RevealHeading text="SESSIONS" className="text-5xl lg:text-8xl" />
        <p className="mt-4 text-sm text-muted-fg uppercase tracking-widest">
          TRACK YOUR STUDY TIME AND PROGRESS
        </p>
      </div>

      {/* Timer */}
      <div className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form fields — 3 cols */}
        <div className="space-y-6 lg:col-span-3">
          <div>
            <label className="text-xs font-bold text-zinc-400 tracking-wider mb-2 block">
              SESSION TITLE
            </label>
            <input
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="E.G. REVIEWING CHAPTER 5"
              disabled={timerRunning}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-yellow-400 text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm transition-all outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-400 tracking-wider mb-2 block">
              SUBJECT (OPTIONAL)
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={timerRunning}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-yellow-400 text-white rounded-lg px-4 py-3 text-sm transition-all outline-none disabled:opacity-50 appearance-none"
              style={{ colorScheme: "dark" }}
            >
              <option value="" className="bg-zinc-950 text-white">
                GENERAL
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-950 text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Timer Hero — 2 cols */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl p-8">
          <div
            className={`flex flex-col items-center justify-center gap-4 ${timerRunning && !timerPaused ? "shadow-[0_0_30px_rgba(225,255,0,0.05)]" : ""} rounded-xl w-full`}
          >
            <p className={`font-mono tracking-wider text-6xl md:text-7xl font-extrabold text-white tabular-nums ${timerRunning && !timerPaused ? "text-yellow-300" : ""} transition-colors`}>
              {formatTimer(timerSeconds)}
            </p>
          </div>
          <button
            onClick={!timerRunning ? startTimer : timerPaused ? resumeTimer : pauseTimer}
            disabled={!timerRunning && !sessionTitle.trim() ? true : false}
            className={cn(
              "mt-6 w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-black text-lg rounded-lg shadow uppercase tracking-wide transition-all py-3 flex items-center justify-center gap-2",
              (!timerRunning && !sessionTitle.trim()) && "opacity-50 cursor-not-allowed"
            )}
          >
            {!timerRunning ? (
              <>
                <Play size={20} /> START
              </>
            ) : timerPaused ? (
              <>
                <Play size={20} /> RESUME
              </>
            ) : (
              <>
                <Pause size={20} /> PAUSE
              </>
            )}
          </button>
          {timerRunning && (
            <button
              onClick={stopTimer}
              className="mt-2 w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black text-sm rounded-lg uppercase tracking-wide transition-all py-2.5 flex items-center justify-center gap-2 border border-red-500/20"
            >
              <Square size={14} /> STOP & SAVE
            </button>
          )}
        </div>
      </div>

      {/* Session History */}
      <div>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-3xl font-bold uppercase tracking-tighter">
            HISTORY
          </h2>
          {sessions.length > 0 && (
            <div className="flex gap-6 text-xs font-bold uppercase tracking-widest text-muted-fg">
              <span>{sessions.length} SESSIONS</span>
              <span>{formatDuration(totalMinutes)} TOTAL</span>
            </div>
          )}
        </div>
        {!loaded ? (
          <div className="border-2 border-border divide-y-2 divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3 w-3" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Timer size={48} />}
            title="NO SESSIONS YET"
            description="START YOUR FIRST STUDY SESSION WITH THE TIMER ABOVE."
          />
        ) : (
          <div className="border-2 border-border divide-y-2 divide-border">
            {sessions.map((session) => (
              <div key={session.id} className="group flex items-center justify-between p-6 transition-colors hover:border-accent hover:bg-muted/30">
                <div className="flex items-center gap-4">
                  {session.subject && (
                    <div
                      className="h-3 w-3"
                      style={{ backgroundColor: session.subject.color }}
                    />
                  )}
                  <div>
                    <p className="font-bold uppercase tracking-tight">
                      {session.title}
                    </p>
                    <p className="text-xs text-muted-fg uppercase tracking-widest">
                      {session.subject?.name ?? "GENERAL"} •{" "}
                      {formatDate(session.startedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={session.completed ? "success" : "default"}>
                    {session.completed ? "DONE" : "PARTIAL"}
                  </Badge>
                  <span className="flex items-center gap-2 text-xs text-muted-fg uppercase tracking-widest">
                    <Clock size={12} />
                    {formatDuration(session.durationMin)}
                  </span>
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    aria-label="Delete session"
                    className="p-1.5 text-muted-fg transition-colors hover:bg-danger hover:text-on-color"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
