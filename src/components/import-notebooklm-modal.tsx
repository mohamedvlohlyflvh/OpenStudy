"use client";

import { useState } from "react";
import { parseNotebookLMJSON, type NotebookLMCard } from "@/lib/parsers/notebooklm";
import { importBundleCards } from "@/app/actions";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

const EXAMPLE_JSON = `[
  { "question": "What is the capital of France?", "answer": "Paris" },
  { "question": "Define photosynthesis.", "answer": "Plants converting light into chemical energy." }
]`;

interface Props {
  bundleId: string;
  open: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
}

export default function ImportNotebookLMModal({ bundleId, open, onClose, onImported }: Props) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(0);
  const router = useRouter();

  if (!open) return null;

  const reset = () => {
    setError(null);
    setSuccess(0);
    setRaw("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleImport = async () => {
    setError(null);
    setSuccess(0);

    let cards: NotebookLMCard[];
    try {
      cards = parseNotebookLMJSON(raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    if (cards.length === 0) {
      setError("No cards parsed — JSON array was empty.");
      return;
    }

    setImporting(true);
    try {
      // Single source of truth: write to SQLite via server action.
      // (Previously this also bulk-added random-UUID copies to Dexie,
      // creating ghost cards the review-sync hook could never reconcile.)
      const res = await importBundleCards(
        bundleId,
        cards.map((c) => ({ front: c.question, back: c.answer }))
      );

      // Revalidate route data so card counts/lists refresh.
      router.refresh();

      setSuccess(res.count);
      setRaw("");
      onImported?.(res.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to store cards.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      <div className="rise-in relative w-full max-w-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-tighter text-white">
              IMPORT FROM NOTEBOOKLM
            </h2>
            <p className="mt-1 text-xs text-zinc-400 uppercase tracking-widest">
              JSON → Flashcards
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="rounded-none p-1 text-zinc-400 transition-colors hover:bg-yellow-400 hover:text-zinc-950"
          >
            <X size={18} />
          </button>
        </div>

        {/* Instructions */}
        <ol className="mb-5 space-y-2 border border-zinc-800 bg-zinc-900/50 p-4">
          {[
            "Copy the prompt from the NotebookLM export button.",
            "Paste it into https://notebook.google.com and run it on your notes.",
            "Paste the JSON array NotebookLM returns into the box below.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-yellow-400 font-mono text-xs font-bold text-zinc-950">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {/* Textarea */}
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setError(null);
          }}
          placeholder={EXAMPLE_JSON}
          spellCheck={false}
          className="h-48 w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-yellow-400"
        />

        {/* Error */}
        {error && (
          <div className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-400">
            ⚠ {error}
          </div>
        )}

        {/* Success */}
        {success > 0 && (
          <div className="mt-4 border border-yellow-400/40 bg-yellow-400/10 p-3 text-sm font-bold text-yellow-400">
            ✓ {success} CARD{success !== 1 ? "S" : ""} IMPORTED
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-md px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-400 transition-colors hover:text-fg"
          >
            CANCEL
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !raw.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-yellow-400 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-950 transition-all hover:bg-yellow-300 disabled:opacity-50"
          >
            {importing ? "IMPORTING..." : "IMPORT CARDS"}
          </button>
        </div>
      </div>
    </div>
  );
}
