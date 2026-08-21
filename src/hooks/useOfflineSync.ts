"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { db, getPendingReviews, markReviewSynced, applyLocalReview } from "@/lib/db";
import { reviewFlashcardWithLog } from "@/app/actions";

export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  // Track connectivity
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Refresh pending count
  const refreshPending = useCallback(async () => {
    const p = await getPendingReviews();
    setPending(p.length);
  }, []);

  useEffect(() => {
    // Defer so the setState inside refreshPending isn't flagged as
    // a synchronous state update within the effect body.
    const t = setTimeout(() => refreshPending(), 0);
    return () => clearTimeout(t);
  }, [refreshPending]);

  // Flush pending reviews when back online.
  // Guarded by a ref so rapid online/offline toggles can't start
  // overlapping flushes (which would double-apply reviews).
  const flush = useCallback(async () => {
    if (!navigator.onLine || flushing.current) return;
    flushing.current = true;
    try {
      const pending = await getPendingReviews();
      for (const r of pending) {
        try {
          await reviewFlashcardWithLog(r.flashcardId, r.quality);
          await markReviewSynced(r.id!);
        } catch (e) {
          // Leave it queued; will retry on next flush. Don't throw.
          console.error("Failed to sync review", e);
        }
      }
      await refreshPending();
    } finally {
      flushing.current = false;
    }
  }, [refreshPending]);

  useEffect(() => {
    if (online) {
      const t = setTimeout(() => flush(), 0);
      return () => clearTimeout(t);
    }
  }, [online, flush]);

  // Wrapper:
  //  - ONLINE  → call server. On success, done. On failure, report the
  //    error but DO NOT silently queue locally — a slow-but-successful
  //    server call would otherwise be double-applied on flush (P0 bug).
  //  - OFFLINE → queue locally + optimistic update only.
  const reviewCard = useCallback(
    async (flashcardId: string, quality: number) => {
      if (navigator.onLine) {
        try {
          await reviewFlashcardWithLog(flashcardId, quality);
          return;
        } catch (e) {
          // Network/server error while online: surface it, don't duplicate.
          console.error("Review failed (not queued — will retry on next action)", e);
          throw e;
        }
      }
      await applyLocalReview(flashcardId, quality);
      await db.reviews.add({
        flashcardId,
        quality,
        reviewedAt: Date.now(),
        synced: false,
      });
      await refreshPending();
    },
    [refreshPending]
  );

  return { online, pending, reviewCard, refreshPending };
}
