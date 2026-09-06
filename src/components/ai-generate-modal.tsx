"use client";

// Direct AI card generation — paste source text, the server calls Gemini,
// and the result is previewed for one-click bulk-accept. The downstream
// pipeline is the same `bulkCreateFlashcards` the NotebookLM import uses,
// so cards land in a bundle identically.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { Button, Modal } from "./ui";
import { bulkCreateFlashcards } from "@/app/actions";
import type { AiCardInput } from "@/lib/ai-import/schema";
import { useRouter } from "next/navigation";
import type { BundleRec } from "@/lib/db";

type BundleLike = Pick<BundleRec, "id" | "name">;

type Phase =
  | "input" // user is typing/pasting source
  | "generating" // server is calling Gemini
  | "preview" // cards are back, user can prune + accept
  | "saving" // bulk-create in flight
  | "done" // saved
  | "error";

const MAX_CHARS = 8_000;
const MIN_CHARS = 20;

interface ApiSuccess {
  ok: true;
  cards: AiCardInput[];
  model: string;
  elapsedMs: number;
}
interface ApiError {
  ok: false;
  error: string;
  message: string;
}

export function AiGenerateModal({
  bundles,
  defaultBundleId,
  onClose,
  onCreated,
}: {
  bundles: BundleLike[];
  defaultBundleId?: string;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("input");
  const [source, setSource] = useState("");
  const [bundleId, setBundleId] = useState<string>(defaultBundleId ?? bundles[0]?.id ?? "");
  const [cards, setCards] = useState<AiCardInput[]>([]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [err, setErr] = useState("");
  const [errCode, setErrCode] = useState<string>("");
  const [meta, setMeta] = useState<{ model: string; elapsedMs: number } | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 150);
  };

  // Cmd/Ctrl+Enter to generate from the textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && phase === "input") {
        e.preventDefault();
        void generate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, source, bundleId]);

  const sourceLen = source.length;
  const sourceValid = sourceLen >= MIN_CHARS && sourceLen <= MAX_CHARS;

  const generate = async () => {
    if (!sourceValid) {
      setErr(
        sourceLen < MIN_CHARS
          ? `Need at least ${MIN_CHARS} characters.`
          : `Max ${MAX_CHARS.toLocaleString()} characters — split into smaller chunks.`
      );
      setErrCode("CLIENT_VALIDATION");
      setPhase("error");
      return;
    }
    if (!bundleId) {
      setErr("Pick a destination bundle first.");
      setErrCode("NO_BUNDLE");
      setPhase("error");
      return;
    }
    setPhase("generating");
    setErr("");
    setErrCode("");
    setMeta(null);
    try {
      const r = await fetch("/api/ai/generate-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: source }),
      });
      const data: ApiSuccess | ApiError = await r.json();
      if (!data.ok) {
        setErr(data.message);
        setErrCode(data.error);
        setPhase("error");
        return;
      }
      setCards(data.cards);
      setRejected(new Set());
      setMeta({ model: data.model, elapsedMs: data.elapsedMs });
      setPhase("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setErrCode("NETWORK");
      setPhase("error");
    }
  };

  const acceptAll = async () => {
    const keep = cards.filter((_, i) => !rejected.has(i));
    if (keep.length === 0) {
      setErr("Uncheck at least one card to accept.");
      setErrCode("NONE_SELECTED");
      setPhase("error");
      return;
    }
    setPhase("saving");
    setErr("");
    try {
      const r = await bulkCreateFlashcards(
        bundleId,
        JSON.stringify(keep.map((c) => ({
          front: c.front,
          back: c.back,
          ...(c.description ? { description: c.description } : {}),
        })))
      );
      if (!r.ok) {
        setErr(r.error || "Import failed.");
        setErrCode("BULK_FAILED");
        setPhase("error");
        return;
      }
      setSavedCount(r.created);
      setPhase("done");
      try {
        if (onCreated) await onCreated();
        else router.refresh();
      } catch {
        /* parent re-fetch failed */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setErrCode("BULK_FAILED");
      setPhase("error");
    }
  };

  const toggleReject = (i: number) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const keepCount = cards.length - rejected.size;
  const selectedBundle = bundles.find((b) => b.id === bundleId);

  // ─── Input step ──────────────────────────────────────────────────
  const inputStep = (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          STEP 01 — PICK A BUNDLE
        </p>
        {bundles.length > 0 ? (
          <select
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            className="w-full rounded-xl border-2 border-border bg-bg px-3 py-2 text-sm font-bold text-fg focus:border-accent focus:outline-none"
            aria-label="Destination bundle"
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.id} className="bg-bg text-fg">
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-warning">
            NO BUNDLES YET — CREATE ONE IN /bundles FIRST.
          </p>
        )}
      </div>

      <div className="h-px w-full bg-border" aria-hidden />

      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            STEP 02 — PASTE SOURCE TEXT
          </p>
          <span
            className={`font-mono text-[10px] uppercase tracking-widest ${
              sourceLen > MAX_CHARS
                ? "text-danger"
                : sourceLen >= MIN_CHARS
                ? "text-success"
                : "text-muted-fg"
            }`}
          >
            {sourceLen.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            if (phase === "error") setPhase("input");
          }}
          placeholder={
            "Paste lesson notes, a chapter, a transcript, an OCR'd page — anything teachable.\n\nTip: ⌘/Ctrl + Enter to generate."
          }
          className="w-full min-h-[260px] resize-y rounded-xl border-2 border-border bg-bg p-3 text-sm text-fg leading-relaxed placeholder:text-muted-fg/50 focus:border-accent focus:outline-none"
          spellCheck={false}
          autoComplete="off"
          aria-label="Source text for AI card generation"
        />
        <p className="text-[11px] text-muted-fg leading-relaxed">
          {sourceLen < MIN_CHARS
            ? `NEED ${MIN_CHARS - sourceLen} MORE CHARACTERS`
            : sourceLen > MAX_CHARS
            ? "OVER LIMIT — SPLIT INTO SMALLER CHUNKS"
            : "READY · PRESS GENERATE OR USE ⌘/CTRL + ENTER"}
        </p>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold uppercase tracking-wider">
              {errCode.replaceAll("_", " ")}
            </p>
            <p className="mt-0.5">{err}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={close}>
          CANCEL
        </Button>
        <Button
          size="sm"
          onClick={generate}
          disabled={!sourceValid || !bundleId || bundles.length === 0}
        >
          <Wand2 size={14} /> GENERATE CARDS
        </Button>
      </div>
    </div>
  );

  // ─── Generating step ─────────────────────────────────────────────
  const generatingStep = (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 size={28} className="animate-spin text-accent" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        CALLING GEMINI…
      </p>
      <p className="max-w-sm text-center text-xs text-muted-fg leading-relaxed">
        Generating from {sourceLen.toLocaleString()} chars into{" "}
        <span className="font-bold text-fg">{selectedBundle?.name ?? "—"}</span>.
      </p>
    </div>
  );

  // ─── Preview step ────────────────────────────────────────────────
  const previewStep = (
    <div className="space-y-4">
      {meta && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-bg/50 px-3 py-2 text-[11px] uppercase tracking-widest text-muted-fg">
          <span>
            <span className="font-bold text-fg">{cards.length}</span> CARD
            {cards.length !== 1 ? "S" : ""} GENERATED · {(meta.elapsedMs / 1000).toFixed(1)}S · {meta.model}
          </span>
          <button
            type="button"
            onClick={() => {
              setPhase("input");
              setCards([]);
              setRejected(new Set());
              setErr("");
            }}
            className="flex items-center gap-1 text-accent hover:underline"
          >
            <RefreshCw size={12} /> REGENERATE
          </button>
        </div>
      )}

      <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {cards.map((c, i) => {
          const off = rejected.has(i);
          return (
            <li
              key={i}
              className={`group rounded-xl border-2 p-3 transition-colors ${
                off
                  ? "border-border bg-bg/30 opacity-50"
                  : "border-border bg-bg hover:border-accent/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleReject(i)}
                  aria-pressed={!off}
                  aria-label={off ? "Include this card" : "Exclude this card"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    off
                      ? "border-border bg-bg text-muted-fg"
                      : "border-accent bg-accent text-accent-fg"
                  }`}
                >
                  {off ? <X size={14} /> : <Check size={14} />}
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={`text-sm font-bold leading-snug ${off ? "line-through text-muted-fg" : "text-fg"}`}
                  >
                    {c.front}
                  </p>
                  <p
                    className={`text-xs leading-relaxed ${off ? "line-through text-muted-fg" : "text-muted-fg"}`}
                  >
                    {c.back}
                  </p>
                  {c.description && (
                    <p className="text-[10px] uppercase tracking-widest text-accent">
                      HINT · {c.description}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>{err}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-fg">
          {keepCount} OF {cards.length} SELECTED
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPhase("input")}>
            BACK
          </Button>
          <Button
            size="sm"
            onClick={acceptAll}
            disabled={keepCount === 0}
          >
            <Check size={14} /> ADD {keepCount} CARD{keepCount !== 1 ? "S" : ""}
          </Button>
        </div>
      </div>
    </div>
  );

  // ─── Saving step ─────────────────────────────────────────────────
  const savingStep = (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 size={28} className="animate-spin text-accent" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        ADDING CARDS…
      </p>
    </div>
  );

  // ─── Done step ───────────────────────────────────────────────────
  const doneStep = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <Check size={18} className="shrink-0 mt-0.5 text-success" />
        <div>
          <p className="font-bold uppercase tracking-tight text-fg">
            ADDED {savedCount} CARD{savedCount !== 1 ? "S" : ""} TO {selectedBundle?.name ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-fg uppercase tracking-widest">
            READY FOR REVIEW · DUE IMMEDIATELY
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/bundles/${bundleId}/cards`)}
        >
          REVIEW CARDS
        </Button>
        <Button size="sm" onClick={close}>
          DONE
        </Button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title="AI GENERATE CARDS">
      <div className="space-y-4">
        {phase === "input" && inputStep}
        {phase === "generating" && generatingStep}
        {phase === "preview" && previewStep}
        {phase === "saving" && savingStep}
        {phase === "done" && doneStep}
        {phase === "error" && (
          <>
            {inputStep}
            <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>{err}</p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
