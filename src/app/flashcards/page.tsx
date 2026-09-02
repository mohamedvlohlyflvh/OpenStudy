"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { Brain, Zap, Plus, Pencil, Trash2, Layers, BarChart3, AlertTriangle, Timer, Download, Upload, Wifi, WifiOff, Search, CheckSquare, Square, Tag, ArrowRight } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Badge, EmptyState, Modal, Input, Skeleton } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { Markdown } from "@/components/markdown";
import { showUndo } from "@/components/undo-toast";
import {
  getDueFlashcards,
  getSubjects,
  getAllFlashcards,
  getAllDueFlashcards,
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  getBundles,
  getBundleCards,
  getLeechCards,
  unLeechCard,
  getHeatmapData,
  getStreak,
  createBundleFlashcard,
  exportBundle,
  importBundleCards,
  editBundleFromFlashcards,
  createStudySession,
  batchDeleteCards,
  batchTagCards,
  batchMoveCards,
  restoreFlashcard,
  getFlashcardSnapshot,
} from "@/app/actions";
import { SubjectTopicSelect } from "@/components/subject-topic-select";
import { cn } from "@/lib/utils";
import { spotlightProps } from "@/lib/interactions";
import { motion } from "framer-motion";
import { parseCardsFile } from "@/lib/parsers/cards";
import { db as offlineDb, cacheBundles, cacheFlashcards, getCachedBundleCards } from "@/lib/db";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { ImageUploadButton } from "@/components/image-upload-button";
import { AiImportButton } from "@/components/ai-import-button";

type Flashcard = Awaited<ReturnType<typeof getDueFlashcards>>[number];
type ManagedFlashcard = Awaited<ReturnType<typeof getAllFlashcards>>[number];
type Bundle = Awaited<ReturnType<typeof getBundles>>[number];
type Subject = { id: string; name: string; color: string };

const ratingButtons = [
  { value: 0, label: "DIDN'T REMEMBER", shortLabel: "AGAIN", color: "border-danger bg-danger/10 text-danger hover:bg-danger hover:text-on-color" },
  { value: 3, label: "REMEMBERED WITH DIFFICULTY", shortLabel: "HARD", color: "border-warning bg-warning/10 text-warning hover:bg-warning hover:text-on-color" },
  { value: 5, label: "REMEMBERED EASILY", shortLabel: "EASY", color: "border-success bg-success/10 text-success hover:bg-success hover:text-on-color" },
];

function getCardStatus(card: { reviewCount: number; nextReview: Date | string }, nowMs: number) {
  const rc = card.reviewCount;
  const isDue = new Date(card.nextReview).getTime() <= nowMs;
  if (rc === 0) return { label: "NEW", dot: "bg-gray-400" };
  if (isDue) return { label: "DUE", dot: "bg-danger" };
  if (rc <= 3) return { label: "LEARNING", dot: "bg-warning" };
  return { label: "MATURE", dot: "bg-success" };
}

function FlashcardsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bundleParam = searchParams.get("bundle");

  // ─── Core state ─────────────────────────────────────────────
  const [mode, setMode] = useState<"review" | "browse" | "leeches" | "stats">("review");
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState(bundleParam || "");
  const allDueParam = searchParams.get("all") === "1";
  // Derived from the URL (?all=1) — the old setAllDue was never called, which
  // froze Study All Due at its mount-time value.
  const allDue = allDueParam;
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);
  // wall clock — captured once in the mount effect (react-hooks/purity bans Date.now() in render)
  const [nowMs, setNowMs] = useState(0);

  // ─── Review state ───────────────────────────────────────────
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const [learningQueue, setLearningQueue] = useState<Flashcard[]>([]);
  const [sprintMode, setSprintMode] = useState(false);
  const [sprintTimer, setSprintTimer] = useState(5);
  const sprintRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Auto study-session logging ────────────────────────────
  // Accumulates reviews for the current run; logged as a StudySession
  // when the review queue is exhausted (run complete).
  const sessionRef = useRef<{ reviewed: number; correct: number; startedAt: number }>({
    reviewed: 0,
    correct: 0,
    startedAt: 0,
  });
  const sessionLoggedRef = useRef(false);

  // ─── Leech state ────────────────────────────────────────────
  const [leechCards, setLeechCards] = useState<(Flashcard & { bundle: { id: string; name: string } | null })[]>([]);
  const [leechLoaded, setLeechLoaded] = useState(false);

  // ─── Browse-all (search across all bundles) ───────────────
  const [browseCards, setBrowseCards] = useState<ManagedFlashcard[]>([]);
  const [browseBundles, setBrowseBundles] = useState<Bundle[]>([]);
  const [browseLoaded, setBrowseLoaded] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseScope, setBrowseScope] = useState<"cards" | "bundles">("cards");
  const [browseFlipped, setBrowseFlipped] = useState<Set<string>>(new Set());
  const [browseSelected, setBrowseSelected] = useState<Set<string>>(new Set());
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState("");
  const [batchMoveModalOpen, setBatchMoveModalOpen] = useState(false);
  const [batchMoveTarget, setBatchMoveTarget] = useState("");

  const loadBrowseAll = useCallback(async () => {
    const [cards, bundles] = await Promise.all([
      getAllFlashcards() as Promise<ManagedFlashcard[]>,
      getBundles(),
    ]);
    setBrowseCards(cards);
    setBrowseBundles(bundles);
    setBrowseLoaded(true);
  }, []);

  const browseFilteredCards = useMemo(() => {
    const q = browseQuery.toLowerCase();
    return browseCards.filter((card: ManagedFlashcard) => {
      const matchesSearch =
        !q ||
        card.front.toLowerCase().includes(q) ||
        card.back.toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [browseCards, browseQuery]);

  const browseFilteredBundles = useMemo(() => {
    const q = browseQuery.toLowerCase();
    return browseBundles.filter(
      (b) => !q || b.name.toLowerCase().includes(q) || (b.description ?? "").toLowerCase().includes(q)
    );
  }, [browseBundles, browseQuery]);

  // ─── Stats state ────────────────────────────────────────────
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);

  // ─── Create modal ───────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [creating, setCreating] = useState(false);

  // ─── Edit/Delete modal ──────────────────────────────────────
  const [editCard, setEditCard] = useState<ManagedFlashcard | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedFlashcard | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Edit Bundle (from flashcards page) ────────────────────
  const [editBundleOpen, setEditBundleOpen] = useState(false);
  const [editBundleName, setEditBundleName] = useState("");
  const [editBundleDesc, setEditBundleDesc] = useState("");
  const [editBundleColor, setEditBundleColor] = useState("#DFE104");
  const [savingBundle, setSavingBundle] = useState(false);

  // ─── Offline sync ───────────────────────────────────────────
  const { online, pending, reviewCard } = useOfflineSync();

  // ─── Confetti ───────────────────────────────────────────────
  const triggerConfetti = useCallback(() => {
    const colors = ["#DFE104", "#22C55E", "#3B82F6", "#EF4444", "#EC4899"];
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
    document.body.appendChild(container);
    for (let i = 0; i < 30; i++) {
      const p = document.createElement("div");
      p.style.cssText = `position:absolute;width:8px;height:8px;background:${colors[i % colors.length]};left:${Math.random() * 100}%;top:-10px;opacity:1;transition:all 2s ease-out`;
      container.appendChild(p);
      requestAnimationFrame(() => {
        p.style.top = `${100 + Math.random() * 20}%`;
        p.style.opacity = "0";
        p.style.transform = `rotate(${Math.random() * 360}deg)`;
      });
    }
    setTimeout(() => container.remove(), 2500);
  }, []);

  // ─── Data loading ───────────────────────────────────────────
  useEffect(() => {
    Promise.all([getBundles(), getSubjects()]).then(([b, s]) => {
      setBundles(b);
      setSubjects(s);
      // Cache for offline
      cacheBundles(b.map((x) => ({ id: x.id, name: x.name, description: x.description, color: x.color, cardCount: x._count.flashcards, synced: true })));
      setSelectedBundle(bundleParam || "");
      setLoaded(true);
    });
  }, [bundleParam]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  // ─── Review queue loader — runs on mount AND whenever the bundle context
  // changes (dropdown select, ?bundle=, ?all=1). Resets run state so switching
  // bundles can no longer keep serving the previous bundle's cards while the
  // header/ADD CARD/export point at the new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cards: Flashcard[];
      if (!selectedBundle && !allDue) {
        cards = []; // bundle-overview view — nothing to serve
      } else if (allDue) {
        // Study All Due: due queue across every bundle
        cards = (await getAllDueFlashcards()) as Flashcard[];
      } else {
        try {
          cards = (await getBundleCards(selectedBundle)) as Flashcard[];
        } catch {
          // offline fallback
          const cached = await getCachedBundleCards(selectedBundle);
          cards = cached as unknown as Flashcard[];
        }
      }
      if (cancelled) return;
      setDueCards(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setLearningQueue([]);
      setCompletedCount(0);
      setTotalReviewed(0);
      sessionLoggedRef.current = false;
      sessionRef.current = { reviewed: 0, correct: 0, startedAt: 0 };
    })();
    return () => { cancelled = true; };
  }, [selectedBundle, allDue]);

  const loadDueCards = useCallback(async () => {
    let cards: Flashcard[];
    if (allDue) {
      cards = (await getAllDueFlashcards()) as Flashcard[];
    } else {
      cards = selectedBundle
        ? await getBundleCards(selectedBundle)
        : await getAllFlashcards();
    }
    setDueCards(cards);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [selectedBundle, allDue]);

  const fetchMoreDue = useCallback(async () => {
    let more: Flashcard[];
    if (allDue) {
      more = (await getAllDueFlashcards()) as Flashcard[];
    } else {
      more = selectedBundle
        ? await getBundleCards(selectedBundle)
        : await getAllFlashcards();
    }
    setDueCards((prev) => [...prev, ...(more as Flashcard[]).filter((c) => !prev.some((p) => p.id === c.id))]);
  }, [selectedBundle, allDue]);

  // Full reload of bundle list + card lists (used after import).
  const reloadCards = useCallback(async () => {
    const b = await getBundles();
    setBundles(b);
    cacheBundles(b.map((x) => ({ id: x.id, name: x.name, description: x.description, color: x.color, cardCount: x._count.flashcards, synced: true })));
    if (selectedBundle) {
      try {
        const cards = await getBundleCards(selectedBundle);
        setDueCards(cards as Flashcard[]);
        cacheFlashcards(cards.map((c) => ({ id: c.id, bundleId: c.bundleId, front: c.front, back: c.back, reviewCount: c.reviewCount, nextReview: new Date(c.nextReview).getTime(), isLeech: c.isLeech, synced: true })));
      } catch {
        // keep current list on transient failure
      }
    } else {
      const cards = await getAllFlashcards();
      setDueCards(cards as Flashcard[]);
    }
    if (browseLoaded) await loadBrowseAll();
  }, [selectedBundle, browseLoaded, loadBrowseAll]);

  // ─── Review handlers ────────────────────────────────────────
  // Serve the main due queue first; once it's exhausted, serve the
  // same-session relearning queue (cards rated AGAIN / HARD).
  const activeCard = dueCards[currentIndex] ?? learningQueue[0] ?? null;

  const handleReview = useCallback(
    async (quality: number) => {
      if (!activeCard || reviewing) return;
      const servingFromQueue = dueCards[currentIndex] == null;
      setReviewing(true);
      try {
        await reviewCard(activeCard.id, quality);
        // Track run stats for auto session logging
        if (sessionRef.current.reviewed === 0) sessionRef.current.startedAt = Date.now();
        sessionRef.current.reviewed += 1;
        if (quality >= 3) sessionRef.current.correct += 1;
        setTotalReviewed((t) => {
          const newTotal = t + 1;
          if (newTotal === 25 || newTotal === 50 || newTotal === 100) {
            setTimeout(() => triggerConfetti(), 0);
          }
          return newTotal;
        });
        setCompletedCount((c) => c + 1);

        if (quality < 3) {
          // AGAIN / HARD: requeue the card for later in THIS session
          setLearningQueue((prev) => [...prev, activeCard]);
        }

        if (!servingFromQueue) {
          // Main queue: advance; finishing it hands control to the relearn queue
          if (currentIndex < dueCards.length - 1) {
            setCurrentIndex((i) => i + 1);
          } else {
            setDueCards([]);
          }
        } else if (quality >= 3) {
          // Relearn queue: remembered → clear the card
          setLearningQueue((prev) => prev.slice(1));
        } else {
          // Relearn queue: lapsed again → send it to the back
          setLearningQueue((prev) => [...prev.slice(1), prev[0]]);
        }
        setIsFlipped(false);

        // Dynamic queue replenishment (only while the main queue is live)
        if (currentIndex < dueCards.length - 5) {
          fetchMoreDue();
        }
      } finally {
        setReviewing(false);
      }
    },
    [activeCard, reviewing, currentIndex, dueCards, reviewCard, fetchMoreDue, triggerConfetti]
  );

  // ─── Speed Sprint timer ─────────────────────────────────────
  useEffect(() => {
    if (sprintMode && isFlipped && activeCard) {
      setSprintTimer(5); // eslint-disable-line react-hooks/set-state-in-effect
      sprintRef.current = setInterval(() => {
        setSprintTimer((t) => {
          if (t <= 1) {
            if (sprintRef.current) clearInterval(sprintRef.current);
            // Fire outside the state updater: React 19 StrictMode
            // double-invokes updaters, which could submit the review twice.
            setTimeout(() => handleReview(0), 0);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => { if (sprintRef.current) clearInterval(sprintRef.current); };
    }
  }, [sprintMode, isFlipped, activeCard, handleReview]);

  // ─── Keyboard handler ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

      // Review keys only apply in review mode — in browse/leeches/stats they
      // used to silently submit SRS ratings for an off-screen card and
      // preventDefault() Space/Enter (breaking scroll and UI shortcuts).
      if (mode !== "review") return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      }
      if (isFlipped) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < ratingButtons.length) {
          handleReview(ratingButtons[idx].value);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, isFlipped, handleReview]);

  useEffect(() => {
    if (mode === "browse" && !browseLoaded) loadBrowseAll(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode, browseLoaded, loadBrowseAll]);

  // ─── Leech data ─────────────────────────────────────────────
  const loadLeeches = useCallback(async () => {
    const cards = await getLeechCards(selectedBundle || undefined);
    setLeechCards(cards);
    setLeechLoaded(true);
  }, [selectedBundle]);

  useEffect(() => {
    if (mode === "leeches" && !leechLoaded) loadLeeches(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode, leechLoaded, loadLeeches]);

  // ─── Stats data ─────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const [h, s] = await Promise.all([getHeatmapData(), getStreak()]);
    setHeatmap(h);
    setStreak(s);
    setStatsLoaded(true);
  }, []);

  useEffect(() => {
    if (mode === "stats" && !statsLoaded) loadStats(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [mode, statsLoaded, loadStats]);

  // ─── Create/Save handlers ──────────────────────────────────
  const handleCreate = async () => {
    if (!front.trim() || !back.trim()) return;
    setCreating(true);
    try {
      if (selectedBundle) {
        await createBundleFlashcard({ bundleId: selectedBundle, front: front.trim(), back: back.trim() });
      } else if (selectedTopicId) {
        await createFlashcard({ topicId: selectedTopicId, front: front.trim(), back: back.trim() });
      }
      setModalOpen(false);
      setFront("");
      setBack("");
      setSelectedTopicId("");
      await loadDueCards();
    } finally {
      setCreating(false);
    }
  };

  const handleEditSave = async () => {
    if (!editCard || !editFront.trim() || !editBack.trim()) return;
    setSaving(true);
    try {
      await updateFlashcard(editCard.id, { front: editFront.trim(), back: editBack.trim() });
      setEditCard(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const snapshot = deleteTarget;
    setDeleting(true);
    try {
      // Snapshot everything needed for a faithful undo BEFORE deletion
      const [cardSnapshot, tagLinks] = await Promise.all([
        getFlashcardSnapshot(snapshot.id),
        offlineDb.cardTags.where("cardId").equals(snapshot.id).toArray(),
      ]);
      await deleteFlashcard(snapshot.id);
      setDeleteTarget(null);
      await loadDueCards();
      showUndo({
        message: `CARD DELETED`,
        undo: async () => {
          // Restore the exact card (same id, SM-2 state, tags, links) —
          // recreating it fresh would silently reset its scheduling.
          if (cardSnapshot) await restoreFlashcard(cardSnapshot, tagLinks);
          await loadDueCards();
        },
      });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Batch operations ─────────────────────────────────────
  const allBrowseSelected = browseFilteredCards.length > 0 && browseFilteredCards.every((c) => browseSelected.has(c.id));
  const toggleBrowseSelectAll = () => {
    if (allBrowseSelected) {
      setBrowseSelected(new Set());
    } else {
      setBrowseSelected(new Set(browseFilteredCards.map((c) => c.id)));
    }
  };
  const toggleBrowseSelect = (id: string) => {
    setBrowseSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const handleBatchDelete = async () => {
    const ids = Array.from(browseSelected);
    if (!ids.length) return;
    await batchDeleteCards(ids);
    setBrowseSelected(new Set());
    await loadBrowseAll();
  };
  const handleBatchTag = async () => {
    const ids = Array.from(browseSelected);
    const tags = batchTagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (!ids.length || !tags.length) return;
    await batchTagCards(ids, tags);
    setBatchTagModalOpen(false);
    setBatchTagInput("");
    setBrowseSelected(new Set());
    await loadBrowseAll();
  };
  const handleBatchMove = async () => {
    const ids = Array.from(browseSelected);
    if (!ids.length) return;
    await batchMoveCards(ids, batchMoveTarget || null);
    setBatchMoveModalOpen(false);
    setBatchMoveTarget("");
    setBrowseSelected(new Set());
    await loadBrowseAll();
  };

  const totalDue = dueCards.length + learningQueue.length;

  // ─── Auto-log study session when the review run is finished ──
  // Fires once when the run completes: the SESSION COMPLETE screen is
  // shown (totalDue === 0 && completedCount > 0). Stats were accumulated
  // in sessionRef during the run.
  useEffect(() => {
    if (
      !sessionLoggedRef.current &&
      sessionRef.current.reviewed > 0 &&
      totalDue === 0 &&
      completedCount > 0
    ) {
      sessionLoggedRef.current = true;
      const mins = Math.max(1, Math.round((Date.now() - sessionRef.current.startedAt) / 60000));
      const acc = sessionRef.current.reviewed
        ? Math.round((sessionRef.current.correct / sessionRef.current.reviewed) * 100)
        : 0;
      createStudySession({
        title: `Flashcard run — ${sessionRef.current.reviewed} reviewed`,
        durationMin: mins,
        notes: `Accuracy: ${acc}%`,
        completed: true,
        startedAt: new Date(sessionRef.current.startedAt),
      }).catch((e) => console.error("Session log failed", e));
    }
  }, [totalDue, completedCount]);

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-6">
        <RevealHeading text="FLASHCARDS" className="text-4xl lg:text-6xl" />
        <ScrambleSubtitle
          text="SPACED REPETITION REVIEW SYSTEM"
          className="mt-2 text-sm text-muted-fg uppercase tracking-widest"
        />
      </div>

      {/* Toolbar */}
      <div className="mb-8 space-y-4 border-b-2 border-border pb-4">
        {/* Row 1 — Primary: bundle context + main action */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedBundle}
            onChange={(e) => {
              setSelectedBundle(e.target.value);
              setLeechLoaded(false);
              setStatsLoaded(false);
            }}
            aria-label="Select bundle to study"
            className="flex h-10 items-center gap-2 border-2 border-border bg-bg px-3 text-sm font-bold uppercase tracking-tight text-fg focus:outline-none"
          >
            <option value="" className="bg-bg text-fg">ALL BUNDLES</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id} className="bg-bg text-fg">{b.name} ({b._count.flashcards})</option>
            ))}
          </select>
          {selectedBundle && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              ADD CARD
            </Button>
          )}
          {selectedBundle && (() => {
            const b = bundles.find((x) => x.id === selectedBundle);
            return b ? (
              <AiImportButton
                bundleId={b.id}
                bundleName={b.name}
                onImported={reloadCards}
              />
            ) : null;
          })()}
          <button
            onClick={() => router.push("/bundles")}
            className="ml-auto py-2 text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-accent"
          >
            MANAGE BUNDLES →
          </button>
        </div>

        {/* Row 2 — Secondary: edit/import/export + mode tabs + status */}
        <div className="flex flex-wrap items-center gap-4">
          {selectedBundle && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  const b = bundles.find((x) => x.id === selectedBundle);
                  if (!b) return;
                  setEditBundleName(b.name);
                  setEditBundleDesc(b.description ?? "");
                  setEditBundleColor(b.color || "#DFE104");
                  setEditBundleOpen(true);
                }}
                className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-fg"
                title="Edit bundle"
              >
                <Pencil size={14} className="inline" /> EDIT
              </button>
              <button
                onClick={async () => {
                  try {
                    const json = await exportBundle(selectedBundle);
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    const rawName = bundles.find((x) => x.id === selectedBundle)?.name ?? "bundle";
                    const safeName = rawName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "bundle";
                    a.href = url;
                    a.download = `${safeName}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (e) {
                    console.error("Export failed", e);
                    alert("EXPORT FAILED — SEE CONSOLE");
                  }
                }}
                className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-fg"
                title="Export bundle as JSON"
              >
                <Download size={14} className="inline" /> EXPORT
              </button>
              <button
                onClick={() => document.getElementById("import-file")?.click()}
                className="text-xs font-bold uppercase tracking-widest text-muted-fg hover:text-fg"
                title="Import cards from JSON/CSV/Anki file"
              >
                <Upload size={14} className="inline" /> IMPORT
              </button>
              <input
                id="import-file"
                type="file"
                accept=".json,.csv,.tsv,.txt,application/json,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    // parseCardsFile handles JSON arrays ({front,back} or
                    // {question,answer}), CSV, and Anki TSV exports.
                    const cards = parseCardsFile(text);
                    if (!cards.length) throw new Error("No valid cards found");
                    const res = await importBundleCards(selectedBundle, cards);
                    if (res.count === 0) throw new Error("No valid cards found");
                    alert(`IMPORTED ${res.count} CARDS`);
                    await reloadCards();
                  } catch (err) {
                    console.error("Import failed", err);
                    alert("IMPORT FAILED: INVALID FILE");
                  }
                  e.target.value = "";
                }}
              />
            </div>
          )}

          <div
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
              online ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
            )}
          >
            {online ? <Wifi size={11} className={pending > 0 ? "animate-pulse" : ""} /> : <WifiOff size={11} />}
            {online ? (pending > 0 ? `SYNCING ${pending}` : "ONLINE") : `OFFLINE (${pending} QUEUED)`}
          </div>

          {/* Mode tabs — sliding accent underline */}
          <div className="flex gap-1 overflow-x-auto rounded-xl border-2 border-border bg-muted/40 p-1">
            {(["review", "browse", "leeches", "stats"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setIsFlipped(false); }}
                className={cn(
                  "relative shrink-0 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                  mode === m ? "text-accent-fg" : "text-muted-fg hover:text-fg"
                )}
              >
                {mode === m && (
                  <motion.span
                    layoutId="fc-tab-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    className="absolute inset-0 rounded-lg bg-accent"
                  />
                )}
                <span className="relative z-10">
                  {m === "review" && <Brain size={14} className="mr-1 inline" />}
                  {m === "browse" && <Search size={14} className="mr-1 inline" />}
                  {m === "leeches" && <AlertTriangle size={14} className="mr-1 inline" />}
                  {m === "stats" && <BarChart3 size={14} className="mr-1 inline" />}
                  {m.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════ REVIEW MODE ═══════════════ */}
      {mode === "review" && (
        !selectedBundle && !allDue ? (
          /* Bundle overview when ALL BUNDLES is selected */
          <div className="space-y-8">
            <p className="text-sm text-muted-fg uppercase tracking-widest">
              SELECT A BUNDLE TO START REVIEWING
            </p>
            {bundles.length === 0 ? (
              <EmptyState
                icon={<Layers size={48} />}
                title="NO BUNDLES YET"
                description="CREATE YOUR FIRST BUNDLE TO ORGANIZE FLASHCARDS."
                action={
                  <Button onClick={() => router.push("/bundles")}>
                    <Plus size={16} />
                    CREATE BUNDLE
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {bundles.map((bundle) => (
                  <button
                    key={bundle.id}
                    onClick={() => setSelectedBundle(bundle.id)}
                    {...spotlightProps()}
                    className="spotlight-card group relative flex h-48 w-full max-w-xs flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-yellow-400/50 hover:bg-zinc-900 hover:shadow-[0_14px_35px_-15px_rgba(0,0,0,0.7)] text-left"
                    style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, ${(bundle.color || "#DFE104")}14, transparent 55%)` }}
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                      style={{
                        backgroundColor: `${bundle.color || "#DFE104"}1f`,
                        color: bundle.color || "#DFE104",
                        boxShadow: `inset 0 0 0 1px ${(bundle.color || "#DFE104")}3d`,
                      }}
                    >
                      {bundle.name.charAt(0)}
                    </div>
                    <div className="mt-3 min-w-0">
                      <h3 className="truncate text-lg font-bold text-white transition-colors group-hover:text-yellow-400">
                        {bundle.name}
                      </h3>
                      {bundle.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                          {bundle.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className="rounded-full px-2.5 py-1 font-mono text-xs"
                        style={{ backgroundColor: `${bundle.color || "#DFE104"}14`, color: bundle.color || "#DFE104" }}
                      >
                        {bundle._count.flashcards} CARD{bundle._count.flashcards !== 1 ? "S" : ""}
                      </span>
                      <span className="text-xs font-bold text-yellow-400 group-hover:underline">
                        Open →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : !loaded ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <Skeleton className="h-1 w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : totalDue === 0 && completedCount === 0 ? (
          <EmptyState
            icon={<Brain size={48} />}
            title="NO CARDS YET"
            description="CREATE YOUR FIRST FLASHCARD TO START STUDYING."
            action={
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} />
                CREATE FIRST CARD
              </Button>
            }
          />
        ) : totalDue === 0 && completedCount > 0 ? (
          /* Session complete */
          <div className="mx-auto max-w-2xl space-y-6 text-center">
            <div className="border-2 border-success bg-success/5 p-8">
              <Zap size={48} className="mx-auto mb-4 text-success" />
              <p className="text-2xl font-bold uppercase tracking-tight">SESSION COMPLETE!</p>
              <p className="mt-2 text-sm text-muted-fg uppercase tracking-widest">
                YOU REVIEWED {totalReviewed} CARD{totalReviewed !== 1 ? "S" : ""} THIS SESSION
              </p>
            </div>
            <div className="flex justify-center gap-4">
              <Button
                onClick={() => {
                  setCompletedCount(0);
                  setTotalReviewed(0);
                  // Allow the next run to auto-log its own study session —
                  // this ref previously stayed true forever, so only the
                  // first run per page load was ever logged.
                  sessionLoggedRef.current = false;
                  sessionRef.current = { reviewed: 0, correct: 0, startedAt: 0 };
                  loadDueCards();
                }}
              >
                STUDY AGAIN
              </Button>
              <Button variant="secondary" onClick={() => setSelectedBundle("")}>
                BACK TO BUNDLES
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Session stats bar */}
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-fg">
              <span>{completedCount} REVIEWED • {totalReviewed} TOTAL</span>
              <div className="flex gap-3">
                {learningQueue.length > 0 && (
                  <Badge variant="warning">RELEARNING × {learningQueue.length}</Badge>
                )}
                <Badge variant="success"><Zap size={12} className="mr-1" />{totalDue} IN QUEUE</Badge>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(completedCount / Math.max(totalDue + completedCount, 1)) * 100}%` }} />
            </div>

            {/* Speed Sprint toggle */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSprintMode(!sprintMode)}
                className={cn(
                  "flex items-center gap-2 border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors",
                  sprintMode ? "border-accent bg-accent text-accent-fg" : "border-border text-muted-fg hover:border-fg"
                )}
              >
                <Timer size={14} />
                SPEED SPRINT
              </button>
              {sprintMode && isFlipped && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 bg-muted">
                    <div className="h-full bg-danger transition-all duration-1000" style={{ width: `${(sprintTimer / 5) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-danger">{sprintTimer}s</span>
                </div>
              )}
            </div>

            {/* Card — true 3D flip: question face and answer face are real
                card faces rotating on rotateY; shape is rounded/layered with
                a corner index instead of the old flat color-swap rectangle. */}
            {activeCard && (
              <div
                className="flip-scene w-full cursor-pointer select-none"
                onClick={() => !sprintMode && setIsFlipped((f) => !f)}
                role="button"
                aria-label={isFlipped ? "Show question" : "Reveal answer"}
              >
                <div className="flip-card relative min-h-[440px] sm:min-h-[500px]" data-flipped={isFlipped}>
                  {/* ── FRONT — QUESTION ── */}
                  <div className="flip-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-2 border-border bg-zinc-900/60 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)]">
                    <span className="absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent" />
                    <div className="flex items-center justify-between px-7 pt-5">
                      <Badge>QUESTION</Badge>
                      {(() => {
                        const st = getCardStatus(activeCard, nowMs);
                        return (
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                            <span className={cn("h-2 w-2 rounded-full", st.dot)} />
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex flex-1 flex-col items-center justify-center px-10 pb-4 text-center">
                      {activeCard.topic && (
                        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-fg/70">
                          {activeCard.topic.subject?.name ?? "GENERAL"} › {activeCard.topic.name}
                        </p>
                      )}
                      <div className="text-3xl font-bold uppercase leading-relaxed tracking-tight sm:text-4xl">
                        {activeCard.front}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/60 px-7 py-3.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                      <span className="font-mono">#{activeCard.id.slice(-4)}</span>
                      <span className="flex animate-pulse items-center gap-1.5">
                        CLICK OR PRESS SPACE TO REVEAL
                        <Zap size={11} />
                      </span>
                    </div>
                  </div>

                  {/* ── BACK — ANSWER ── */}
                  <div className="flip-face flip-back absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-2 border-accent bg-accent shadow-[0_18px_50px_-12px_rgba(250,204,21,0.25)]">
                    <span className="absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent-fg/60 to-transparent" />
                    <div className="flex items-center justify-between px-7 pt-5">
                      <Badge className="bg-accent-fg/15 text-accent-fg">ANSWER</Badge>
                    </div>
                    <div className="flex flex-1 flex-col items-center justify-center px-10 pb-4 text-center">
                      <div className="[&_p]:text-accent-fg [&_li]:text-accent-fg text-3xl font-bold uppercase leading-relaxed tracking-tight text-accent-fg sm:text-4xl [&_.md-p]:text-accent-fg">
                        <Markdown content={activeCard.back} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-accent-fg/15 px-7 py-3.5 text-[10px] font-bold uppercase tracking-widest text-accent-fg/70">
                      <span className="font-mono">#{activeCard.id.slice(-4)}</span>
                      <span>RATE IT BELOW</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Show Answer button (LanGeek style) */}
            {!isFlipped && activeCard && (
              <Button className="w-full" onClick={() => setIsFlipped(true)}>
                SHOW ANSWER
              </Button>
            )}

            {/* Rating buttons */}
            {isFlipped && (
              <div className="grid grid-cols-3 gap-px bg-border">
                {ratingButtons.map((q, idx) => (
                  <button
                    key={q.value}
                    className={cn("bg-bg p-5 text-center transition-all duration-200 active:scale-95", q.color)}
                    onClick={() => handleReview(q.value)}
                    disabled={reviewing}
                  >
                    <p className="text-sm font-bold uppercase tracking-tighter">{q.label}</p>
                    <p className="mt-1 text-[10px] text-muted-fg/50">[{idx + 1}]</p>
                  </button>
                ))}
              </div>
            )}

            <p className="text-center text-xs text-muted-fg uppercase tracking-widest">
              SPACE: FLIP • 1-3: RATE
            </p>
          </div>
        )
      )}

      {/* ═══════════════ BROWSE ALL MODE ═══════════════ */}
      {mode === "browse" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                placeholder={browseScope === "bundles" ? "SEARCH BUNDLES..." : "SEARCH ALL CARDS..."}
                value={browseQuery}
                onChange={(e) => setBrowseQuery(e.target.value)}
                className="h-10 w-full border-2 border-border bg-bg pl-10 pr-3 text-sm font-bold uppercase tracking-tight text-fg placeholder:text-muted focus:outline-none"
              />
            </div>
            <select
              value={browseScope}
              onChange={(e) => setBrowseScope(e.target.value as "cards" | "bundles")}
              aria-label="Search scope: cards or bundles"
              className="h-10 border-2 border-border bg-bg px-3 text-xs font-bold uppercase tracking-widest text-fg focus:outline-none"
            >
              <option value="cards" className="bg-bg text-fg">SEARCH CARDS</option>
              <option value="bundles" className="bg-bg text-fg">SEARCH BUNDLES</option>
            </select>
          </div>

          {/* Batch operations toolbar */}
          {browseScope === "cards" && browseLoaded && browseFilteredCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-2 border-border bg-bg p-3">
              <button
                onClick={toggleBrowseSelectAll}
                className="flex items-center gap-2 border-2 border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:border-fg"
              >
                {allBrowseSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allBrowseSelected ? "DESELECT ALL" : "SELECT ALL"}
              </button>
              {browseSelected.size > 0 && (
                <>
                  <span className="text-xs font-bold uppercase tracking-widest text-accent">{browseSelected.size} SELECTED</span>
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center gap-2 border-2 border-danger px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-danger transition-colors hover:bg-danger hover:text-on-color"
                  >
                    <Trash2 size={14} /> DELETE
                  </button>
                  <button
                    onClick={() => setBatchTagModalOpen(true)}
                    className="flex items-center gap-2 border-2 border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:border-accent hover:text-accent"
                  >
                    <Tag size={14} /> TAG
                  </button>
                  <button
                    onClick={() => setBatchMoveModalOpen(true)}
                    className="flex items-center gap-2 border-2 border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:border-accent hover:text-accent"
                  >
                    <ArrowRight size={14} /> MOVE
                  </button>
                </>
              )}
            </div>
          )}

          {!browseLoaded ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[200px] w-full" />)}
            </div>
          ) : browseFilteredBundles.length === 0 ? (
            <EmptyState icon={<Search size={48} />} title="NO RESULTS" description="TRY A DIFFERENT SEARCH." />
          ) : browseScope === "bundles" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {browseFilteredBundles.map((bundle) => (
                <button
                  key={bundle.id}
                  onClick={() => router.push(`/bundles/${bundle.id}/cards`)}
                  {...spotlightProps()}
                  className="spotlight-card group relative flex h-48 w-full max-w-xs flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-yellow-400/50 hover:bg-zinc-900 hover:shadow-[0_14px_35px_-15px_rgba(0,0,0,0.7)]"
                  style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, ${(bundle.color || "#DFE104")}14, transparent 55%)` }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                    style={{
                      backgroundColor: `${bundle.color || "#DFE104"}1f`,
                      color: bundle.color || "#DFE104",
                      boxShadow: `inset 0 0 0 1px ${(bundle.color || "#DFE104")}3d`,
                    }}
                  >
                    {bundle.name.charAt(0)}
                  </div>
                  <div className="mt-3 min-w-0">
                    <h3 className="truncate text-lg font-bold text-white transition-colors group-hover:text-yellow-400">
                      {bundle.name}
                    </h3>
                    {bundle.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{bundle.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded-full px-2.5 py-1 font-mono text-xs"
                      style={{ backgroundColor: `${bundle.color || "#DFE104"}14`, color: bundle.color || "#DFE104" }}
                    >
                      {bundle._count.flashcards} CARD{bundle._count.flashcards !== 1 ? "S" : ""}
                    </span>
                    <span className="text-xs font-bold text-yellow-400 group-hover:underline">Open →</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {browseFilteredCards.map((card) => {
                const flipped = browseFlipped.has(card.id);
                const selected = browseSelected.has(card.id);
                const status = getCardStatus(card, nowMs);
                return (
                  <div
                    key={card.id}
                    className={cn(
                      "group relative flex min-h-[200px] flex-col overflow-hidden rounded-2xl border-2 p-5 transition-all duration-200",
                      selected ? "border-accent bg-accent/5" : flipped ? "border-accent bg-accent text-accent-fg shadow-[0_14px_40px_-12px_rgba(250,204,21,0.3)] -translate-y-0.5" : "border-border bg-bg shadow-sm hover:-translate-y-1 hover:border-fg hover:shadow-lg"
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleBrowseSelect(card.id); }}
                          className="text-muted-fg hover:text-accent"
                          aria-label={selected ? "Deselect card" : "Select card"}
                        >
                          {selected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
                        </button>
                        <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{status.label}</span>
                      </div>
                    </div>
                    <div
                      className="flex flex-1 cursor-pointer items-center justify-center text-center"
                      onClick={() => setBrowseFlipped((prev) => { const n = new Set(prev); if (n.has(card.id)) n.delete(card.id); else n.add(card.id); return n; })}
                    >
                      <div>
                        <span className={cn("mb-2 inline-block text-[10px] font-bold uppercase tracking-widest", flipped ? "text-accent-fg/70" : "text-muted-fg")}>
                          {flipped ? "ANSWER" : "QUESTION"}
                        </span>
                        <div className="text-lg font-bold uppercase tracking-tight leading-relaxed">{flipped ? <Markdown content={card.back} /> : card.front}</div>
                      </div>
                    </div>
                    {/* Tags */}
                    {card.tags && card.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {card.tags.map(({ tag }) => (
                          <span key={tag.id} className="bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-fg">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Bundle / Topic info */}
                    <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-fg">
                      {card.bundle ? (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2" style={{ backgroundColor: card.bundle.color }} />
                          {card.bundle.name}
                        </span>
                      ) : card.topic ? (
                        <span>{card.topic.subject?.name ?? "GENERAL"} › {card.topic.name}</span>
                      ) : <span />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ LEECHES MODE ═══════════════ */}
      {mode === "leeches" && (
        <div className="space-y-6">
          <div className="border-2 border-danger bg-danger/5 p-4">
            <p className="text-sm font-bold uppercase tracking-widest text-danger">
              <AlertTriangle size={14} className="mr-2 inline" />
              LEECH PROTECTION
            </p>
            <p className="mt-1 text-xs text-muted-fg uppercase tracking-widest">
              CARDS WITH 5+ CONSECUTIVE &quot;AGAIN&quot; ANSWERS ARE FLAGGED HERE. CONSIDER REWRITING, SPLITTING, OR ADDING HINTS.
            </p>
          </div>
          {!leechLoaded ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : leechCards.length === 0 ? (
            <EmptyState icon={<AlertTriangle size={48} />} title="NO LEECHES" description="NO CARDS HAVE BEEN FLAGGED YET. KEEP STUDYING!" />
          ) : (
            <div className="space-y-3">
              {leechCards.map((card) => (
                <div key={card.id} className="flex items-center justify-between border-2 border-border bg-bg p-4">
                  <div className="flex-1">
                    <p className="text-sm font-bold uppercase tracking-tight">{card.front}</p>
                    <p className="text-xs text-muted-fg uppercase tracking-widest">
                      {card.bundle?.name ?? "NO BUNDLE"} • {card.consecutiveAgain}× AGAIN
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={async () => { await unLeechCard(card.id); setLeechCards((prev) => prev.filter((c) => c.id !== card.id)); }}>
                    UN-LEECH
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ STATS MODE ═══════════════ */}
      {mode === "stats" && (
        <div className="space-y-8">
          {/* Streak + Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border-2 border-border bg-bg p-6 text-center">
              <p className="text-4xl font-bold uppercase tracking-tighter text-accent">{streak}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">DAY STREAK</p>
            </div>
            <div className="border-2 border-border bg-bg p-6 text-center">
              <p className="text-4xl font-bold uppercase tracking-tighter">{totalReviewed}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">REVIEWS TODAY</p>
            </div>
            <div className="border-2 border-border bg-bg p-6 text-center">
              <p className="text-4xl font-bold uppercase tracking-tighter text-success">{leechCards.length}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">LEECHES</p>
            </div>
          </div>

          {/* Heatmap */}
          <div>
            <h3 className="mb-4 text-lg font-bold uppercase tracking-tighter">ACTIVITY (LAST 90 DAYS)</h3>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 90 }).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (89 - i));
                // Local-date key — matches getHeatmapData()/getStreak()
                // bucketing (ISO/UTC shifted evening reviews to the next day
                // in positive-offset timezones like UTC+3).
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const entry = heatmap.find((h) => h.date === dateStr);
                const count = entry?.count ?? 0;
                const intensity = count === 0 ? "bg-muted" : count < 5 ? "bg-accent/30" : count < 15 ? "bg-accent/60" : "bg-accent";
                return (
                  <div
                    key={i}
                    className={`h-3 w-3 ${intensity}`}
                    title={`${dateStr}: ${count} reviews`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-fg">
              <span>LESS</span>
              <div className="h-3 w-3 bg-muted" />
              <div className="h-3 w-3 bg-accent/30" />
              <div className="h-3 w-3 bg-accent/60" />
              <div className="h-3 w-3 bg-accent" />
              <span>MORE</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ CREATE MODAL ═══════════════ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="NEW FLASHCARD">
        <div className="space-y-6">
          {!selectedBundle && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">TOPIC</label>
              <SubjectTopicSelect subjects={subjects} value={selectedTopicId} onChange={setSelectedTopicId} />
            </div>
          )}
          {selectedBundle && (
            <div className="inline-flex items-center gap-2 border border-accent/50 bg-accent/5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent">
              <Layers size={12} />
              <span>BUNDLE</span>
              <span className="h-3 w-px bg-accent/40" />
              <span>{bundles.find((b) => b.id === selectedBundle)?.name?.toUpperCase()}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">FRONT (QUESTION)</label>
              <ImageUploadButton onImage={(md) => setFront((prev) => prev ? `${prev} ${md}` : md)} label="IMAGE" />
            </div>
            <Input placeholder="E.G. WHAT IS KINETIC ENERGY?" value={front} onChange={(e) => setFront(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">BACK (ANSWER)</label>
              <ImageUploadButton onImage={(md) => setBack((prev) => prev ? `${prev} ${md}` : md)} label="IMAGE" />
            </div>
            <Input placeholder="E.G. ENERGY OF MOTION" value={back} onChange={(e) => setBack(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCreate(); }}
            />
          </div>
          <p className="text-[10px] text-muted-fg uppercase tracking-widest">⌘/CTRL + ENTER TO SAVE</p>
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>CANCEL</Button>
            <Button onClick={handleCreate} disabled={creating || !front.trim() || !back.trim()}>
              {creating ? "CREATING..." : "CREATE"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ EDIT MODAL ═══════════════ */}
      <Modal open={!!editCard} onClose={() => setEditCard(null)} title="EDIT FLASHCARD">
        {editCard && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">FRONT (QUESTION)</label>
                <ImageUploadButton onImage={(md) => setEditFront((prev) => prev ? `${prev} ${md}` : md)} label="IMAGE" />
              </div>
              <Input value={editFront} onChange={(e) => setEditFront(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">BACK (ANSWER)</label>
                <ImageUploadButton onImage={(md) => setEditBack((prev) => prev ? `${prev} ${md}` : md)} label="IMAGE" />
              </div>
              <Input value={editBack} onChange={(e) => setEditBack(e.target.value)} />
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditCard(null)}>CANCEL</Button>
              <Button onClick={handleEditSave} disabled={saving || !editFront.trim() || !editBack.trim()}>
                {saving ? "SAVING..." : "SAVE"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════ DELETE MODAL ═══════════════ */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="DELETE FLASHCARD">
        {deleteTarget && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">ARE YOU SURE? THIS CANNOT BE UNDONE.</p>
            <div className="border-2 border-border bg-muted/20 p-4">
              <p className="text-sm font-bold uppercase tracking-tight">{deleteTarget.front}</p>
              <p className="mt-1 text-xs text-muted-fg">{deleteTarget.back}</p>
            </div>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>CANCEL</Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "DELETING..." : "DELETE"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════ EDIT BUNDLE MODAL ═══════════════ */}
      <Modal open={editBundleOpen} onClose={() => setEditBundleOpen(false)} title="EDIT BUNDLE">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">NAME</label>
            <input
              value={editBundleName}
              onChange={(e) => setEditBundleName(e.target.value)}
              className="h-10 w-full border-2 border-border bg-bg px-3 text-sm font-bold uppercase tracking-tight text-fg focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">DESCRIPTION (OPTIONAL)</label>
            <input
              value={editBundleDesc}
              onChange={(e) => setEditBundleDesc(e.target.value)}
              className="h-10 w-full border-2 border-border bg-bg px-3 text-sm font-bold uppercase tracking-tight text-fg focus:outline-none"
            />
          </div>
          <BundleColorPicker value={editBundleColor} onChange={setEditBundleColor} />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setEditBundleOpen(false)}>CANCEL</Button>
            <Button
              onClick={async () => {
                if (!selectedBundle || !editBundleName.trim()) return;
                setSavingBundle(true);
                try {
                  await editBundleFromFlashcards(selectedBundle, {
                    name: editBundleName.trim(),
                    description: editBundleDesc.trim() || undefined,
                    color: editBundleColor,
                  });
                  setBundles((prev) => prev.map((b) => b.id === selectedBundle ? { ...b, name: editBundleName.trim(), description: editBundleDesc.trim() || undefined, color: editBundleColor } : b) as typeof prev);
                  setEditBundleOpen(false);
                } catch (e) {
                  console.error("Failed to edit bundle", e);
                } finally {
                  setSavingBundle(false);
                }
              }}
              disabled={savingBundle}
            >
              {savingBundle ? "SAVING..." : "SAVE"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ BATCH TAG MODAL ═══════════════ */}
      <Modal open={batchTagModalOpen} onClose={() => setBatchTagModalOpen(false)} title="BATCH TAG CARDS">
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">ADD TAGS TO {browseSelected.size} SELECTED CARD{browseSelected.size !== 1 ? "S" : ""}.</p>
          <Input
            label="TAGS (COMMA-SEPARATED)"
            placeholder="E.G. VERBS, GRAMMAR, EXAM"
            value={batchTagInput}
            onChange={(e) => setBatchTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBatchTag(); }}
          />
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setBatchTagModalOpen(false)}>CANCEL</Button>
            <Button onClick={handleBatchTag} disabled={!batchTagInput.trim()}>APPLY TAGS</Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ BATCH MOVE MODAL ═══════════════ */}
      <Modal open={batchMoveModalOpen} onClose={() => setBatchMoveModalOpen(false)} title="BATCH MOVE CARDS">
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">MOVE {browseSelected.size} SELECTED CARD{browseSelected.size !== 1 ? "S" : ""} TO A BUNDLE.</p>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">TARGET BUNDLE</label>
            <select
              value={batchMoveTarget}
              onChange={(e) => setBatchMoveTarget(e.target.value)}
              className="h-10 w-full border-2 border-border bg-bg px-3 text-sm font-bold uppercase tracking-tight text-fg focus:outline-none"
            >
              <option value="" className="bg-bg text-fg">NO BUNDLE (UNASSIGNED)</option>
              {bundles.map((b) => (
                <option key={b.id} value={b.id} className="bg-bg text-fg">{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setBatchMoveModalOpen(false)}>CANCEL</Button>
            <Button onClick={handleBatchMove}>MOVE CARDS</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<div className="p-8 lg:p-12"><Skeleton className="h-[400px] w-full" /></div>}>
      <FlashcardsContent />
    </Suspense>
  );
}
