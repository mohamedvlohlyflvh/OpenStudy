"use client";

import { useEffect, useState, useCallback } from "react";
import { reviewFlashcardWithLog } from "@/app/actions";

// Dexie/IndexedDB is the primary (and only) store, so reviews are
// ALWAYS local — there is nothing to sync to a server. This hook
// keeps the online/offline indicator for the UI and exposes the
// same reviewCard API the flashcards page already uses.
export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  // Track connectivity (indicator only)
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

  const refreshPending = useCallback(async () => {
    setPending(0); // nothing ever queues — writes are local
  }, []);

  const reviewCard = useCallback(async (flashcardId: string, quality: number) => {
    await reviewFlashcardWithLog(flashcardId, quality);
  }, []);

  return { online, pending, reviewCard, refreshPending };
}
