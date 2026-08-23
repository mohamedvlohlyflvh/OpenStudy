"use client";

// ─── Weekly Analytics — staggered bar chart (anime.js scaleY) ──────

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface WeekDay {
  label: string; // Mon…Sun
  minutes: number;
}

export function WeeklyAnalytics({ data }: { data: WeekDay[] }) {
  const barsRef = useRef<HTMLDivElement>(null);
  const max = Math.max(60, ...data.map((d) => d.minutes));
  const totalMin = data.reduce((a, d) => a + d.minutes, 0);
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday-first

  useEffect(() => {
    const bars = barsRef.current?.querySelectorAll<HTMLElement>("[data-bar]");
    if (!bars || bars.length === 0) return;
    let cancelled = false;
    import("animejs")
      .then((mod) => {
        if (cancelled) return;
        const { animate, eases } = mod as typeof import("animejs");
        // anime.js v4: animate each bar individually with an index-based delay
        Array.from(bars).forEach((bar, i) => {
          animate(bar, {
            scaleY: [0.02, 1],
            duration: 900,
            delay: i * 70,
            ease: eases.outExpo,
          });
        });
      })
      .catch(() => {
        if (!cancelled)
          bars.forEach((b) => {
            b.style.transform = "scaleY(1)";
          });
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const fmtH = (m: number) =>
    m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`;

  return (
    <div className="glass rounded-3xl p-6" role="img"
      aria-label={`Weekly study: ${fmtH(totalMin)} total across 7 days`}>
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
            This Week
          </p>
          <p className="font-display text-2xl font-bold tabular-nums tracking-tight">
            {fmtH(totalMin)}
          </p>
        </div>
        <span className="rounded-full bg-flow/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-flow">
          Analytics
        </span>
      </div>

      <div ref={barsRef} className="flex h-36 items-end gap-2.5">
        {data.map((d, i) => {
          const h = Math.max(3, (d.minutes / max) * 100);
          const isToday = i === todayIdx;
          return (
            <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="font-mono text-[10px] font-bold tabular-nums text-muted-fg opacity-0 transition-opacity group-hover:opacity-100">
                {d.minutes > 0 ? fmtH(d.minutes) : "—"}
              </span>
              <div
                data-bar
                title={`${d.label}: ${fmtH(d.minutes)}`}
                style={{ height: `${h}%` }}
                className={cn(
                  "w-full origin-bottom rounded-t-lg transition-colors",
                  isToday
                    ? "bg-gradient-to-t from-accent to-flow"
                    : d.minutes > 0
                      ? "bg-flow/40 group-hover:bg-flow/70"
                      : "bg-muted"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide",
                  isToday ? "text-accent" : "text-muted-fg"
                )}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
