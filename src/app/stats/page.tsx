"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { PageLoader } from "@/components/page-loader";
import { StatsStreakBadge } from "@/components/stats-streak-badge";
import { StatsHeatmap } from "@/components/stats-heatmap";
import { RetentionCurve } from "@/components/retention-curve";
import { HardestCardsTable } from "@/components/hardest-cards-table";
import { getAllReviewLogs, getBundles, getFlashcards } from "@/app/actions";
import type { BundleRec, FlashcardRec, ReviewLogRec } from "@/lib/db";

export default function StatsPage() {
  const [reviews, setReviews] = useState<ReviewLogRec[] | null>(null);
  const [bundles, setBundles] = useState<BundleRec[] | null>(null);
  const [cards, setCards] = useState<FlashcardRec[] | null>(null);

  useEffect(() => {
    Promise.all([getAllReviewLogs(), getBundles(), getFlashcards()]).then(
      ([r, b, c]) => {
        setReviews(r);
        setBundles(b);
        setCards(c);
      }
    );
  }, []);

  if (!reviews || !bundles || !cards) {
    return <PageLoader variant="dashboard" titleW="w-48" />;
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <RevealHeading text="STATS" className="text-4xl lg:text-6xl" />
          <ScrambleSubtitle
            text="RETENTION, FORECAST, AND PER-BUNDLE MASTERY"
            className="mt-2 text-sm text-muted-fg uppercase tracking-widest"
          />
        </div>
        <StatsStreakBadge reviews={reviews} />
      </div>

      {/* 52-week heatmap (full year) */}
      <Card className="mb-6 !p-5">
        <p className="mb-1 font-semibold tracking-tight">Year in review</p>
        <p className="mb-4 text-[11px] uppercase tracking-widest text-muted-fg">
          Daily review log · last 52 weeks
        </p>
        <StatsHeatmap reviews={reviews} weeks={52} />
      </Card>

      {/* Placeholders — filled in by tasks P9, P10, P11 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="!p-5">
          <p className="mb-1 font-semibold tracking-tight">Retention curve</p>
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-fg">
            Accuracy vs. days since first review
          </p>
          <RetentionCurve reviews={reviews} />
        </Card>
        <Card className="!p-5">
          <p className="mb-1 font-semibold tracking-tight">Forecast</p>
          <p className="text-[11px] uppercase tracking-widest text-muted-fg">Coming next</p>
        </Card>
      </div>

      <Card className="mt-6 !p-5">
        <p className="mb-1 font-semibold tracking-tight">Per-bundle mastery</p>
        <p className="text-[11px] uppercase tracking-widest text-muted-fg">Coming next</p>
      </Card>

      <Card className="mt-6 !p-5">
        <p className="mb-1 font-semibold tracking-tight">Hardest cards</p>
        <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-fg">
          Lowest accuracy (min. 3 reviews)
        </p>
        <HardestCardsTable reviews={reviews} cards={cards} bundles={bundles} />
      </Card>
    </div>
  );
}
