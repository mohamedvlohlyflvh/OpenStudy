import {
  BookOpen,
  Brain,
  Clock,
  StickyNote,
  Zap,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import Marquee from "react-fast-marquee";
import { Card, Badge } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { QuickNavShelf } from "@/components/quick-nav-shelf";
import { getDashboardStats } from "./actions";
import { formatDuration } from "@/lib/utils";
import { StudyAllDueButton } from "@/components/study-all-due-button";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const statCards = [
    { label: "SUBJECTS", value: stats.totalSubjects, icon: <BookOpen size={20} /> },
    { label: "TOPICS", value: stats.totalTopics, icon: <StickyNote size={20} /> },
    { label: "FLASHCARDS", value: stats.totalFlashcards, icon: <Brain size={20} /> },
    { label: "DUE", value: stats.dueCards, icon: <Zap size={20} /> },
    { label: "SESSIONS", value: stats.totalSessions, icon: <TrendingUp size={20} /> },
    { label: "STUDY TIME", value: formatDuration(stats.totalMinutes), icon: <Clock size={20} /> },
  ];

  return (
    <div className="p-8 lg:p-12">
      {/* Hero Section */}
      <div className="relative mb-16">
        <RevealHeading
          text="DASHBOARD"
          className="text-5xl lg:text-8xl"
        />
        <ScrambleSubtitle
          text="YOUR LEARNING OVERVIEW AT A GLANCE"
          className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
        />
      </div>

      {/* Due Cards Alert */}
      {stats.dueCards > 0 && (
        <div className="mb-8 rise-in border-2 border-accent bg-accent animate-[pulse-border_2s_ease-in-out_infinite]">
          <div className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-4">
              <Zap size={24} className="text-accent-fg" />
              <div>
                <p className="text-xl font-bold uppercase tracking-tighter text-accent-fg">
                  {stats.dueCards} FLASHCARD{stats.dueCards !== 1 && "S"} DUE
                </p>
                <p className="text-sm text-accent-fg/70">
                  KEEP YOUR SPACED REPETITION STREAK GOING
                </p>
              </div>
            </div>
            <StudyAllDueButton />
          </div>
        </div>
      )}

      {/* Stats Marquee */}
      <div className="mb-12 border-y-2 border-border py-6">
        <Marquee speed={60} gradient={false} autoFill>
          {statCards.map((stat, i) => (
            <div key={i} className="mx-8 flex items-center gap-4">
              <span className="text-muted-fg">{stat.icon}</span>
              <span className="text-4xl font-bold uppercase tracking-tighter lg:text-6xl">
                {stat.value}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-fg">
                {stat.label}
              </span>
            </div>
          ))}
        </Marquee>
      </div>

      {/* Stats Grid */}
      <div className="mb-12 grid grid-cols-2 gap-px bg-border lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card
            key={stat.label}
            hover
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <span className="mb-4 text-muted-fg transition-colors group-hover:text-accent-fg">
              {stat.icon}
            </span>
            <p className="text-5xl group-hover:text-accent-fg lg:text-7xl">
              {stat.value}
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg group-hover:text-accent-fg">
              {stat.label}
            </p>
          </Card>
        ))}
      </div>

      {/* Quick Nav — Originkit HoverImageReveal shelf */}
      <div className="mb-12">
        <RevealHeading
          text="QUICK ACCESS"
          tag="h2"
          className="mb-6 text-3xl font-bold tracking-tighter"
        />
        <QuickNavShelf />
      </div>

      {/* Recent Sessions */}
      <div>
        <RevealHeading
          text="RECENT SESSIONS"
          tag="h2"
          className="mb-6 text-3xl font-bold tracking-tighter"
        />
        {stats.recentSessions.length === 0 ? (
          <Card>
            <p className="py-12 text-center text-sm text-muted-fg uppercase tracking-widest">
              NO STUDY SESSIONS YET — START YOUR FIRST SESSION
            </p>
          </Card>
        ) : (
          <div className="border-2 border-border divide-y-2 divide-border">
            {stats.recentSessions.map((session) => (
              <div key={session.id} className="group flex items-center justify-between p-6 transition-colors hover:border-accent hover:bg-muted/30">
                <div className="flex items-center gap-4">
                  <div
                    className="h-3 w-3 transition-transform group-hover:scale-125"
                    style={{
                      backgroundColor: session.subject?.color ?? "#71717A",
                    }}
                  />
                  <div>
                    <p className="font-bold uppercase tracking-tight">
                      {session.title}
                    </p>
                    <p className="text-xs text-muted-fg uppercase tracking-widest">
                      {session.subject?.name ?? "GENERAL"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge
                    variant={session.completed ? "success" : "default"}
                  >
                    {session.completed ? "DONE" : "IN PROGRESS"}
                  </Badge>
                  <span className="text-xs text-muted-fg uppercase tracking-widest">
                    {formatDuration(session.durationMin)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
