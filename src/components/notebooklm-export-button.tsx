"use client";

import { useState } from "react";
import { Copy, ExternalLink, Check, Info, X } from "lucide-react";

const NOTEBOOKLM_URL = "https://notebook.google.com";

/**
 * Builds a markdown document from an array of { title, content } notes.
 */
function buildMarkdown(notes: { title: string; content: string }[]): string {
  const lines: string[] = [];
  for (const n of notes) {
    lines.push(`## ${n.title}`);
    lines.push("");
    lines.push(n.content);
    lines.push("");
  }
  return lines.join("\n");
}

const NOTEBOOKLM_PROMPT = `You are a flashcard extraction engine. Read the study material I provide and output ONLY valid JSON — no prose, no markdown, no code fences.

The JSON must be an array of objects with exactly two keys:
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]

Rules:
- question: a self-contained, studyable question (string, never empty).
- answer: a concise but complete answer (string, never empty).
- Do not include any other keys.
- Return the raw JSON array and nothing else.`;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers blocking the async API.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function NotebookLMExportButton({
  notes,
  label = "NOTEBOOKLM",
  className,
}: {
  notes: { title: string; content: string }[];
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState<"notes" | "prompt" | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const flash = (which: "notes" | "prompt") => {
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyNotes = async () => {
    const md = buildMarkdown(notes);
    await copyToClipboard(md);
    flash("notes");
    window.open(NOTEBOOKLM_URL, "_blank", "noopener");
  };

  const handleCopyPrompt = async () => {
    await copyToClipboard(NOTEBOOKLM_PROMPT);
    flash("prompt");
  };

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopyNotes}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition-all hover:border-yellow-400 hover:text-yellow-400"
      >
        <Copy size={14} />
        <span className={className}>{label}</span>
      </button>
      <button
        type="button"
        onClick={handleCopyPrompt}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-yellow-400 transition-all hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950"
      >
        {copied === "prompt" ? <Check size={14} /> : <Copy size={14} />}
        COPY PROMPT
      </button>
      <button
        type="button"
        onClick={() => setShowInfo((v) => !v)}
        aria-label="How this works"
        aria-expanded={showInfo}
        className="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 p-2 text-muted-fg transition-all hover:border-yellow-400 hover:text-yellow-400"
      >
        <Info size={14} />
      </button>
      {copied && (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
          <Check size={12} />
          {copied === "notes" ? "COPIED — OPENING NOTEBOOKLM" : "PROMPT COPIED"}
        </span>
      )}
      <ExternalLink size={12} className="hidden" />

      {showInfo && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 border-2 border-yellow-400 bg-zinc-950 p-4 shadow-[4px_4px_0_0_rgba(250,204,21,0.4)]">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-yellow-400">
              AI FLASHCARD IMPORT
            </h4>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              aria-label="Close"
              className="text-muted-fg transition-colors hover:text-yellow-400"
            >
              <X size={14} />
            </button>
          </div>
          <ol className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-300">
            <li className="flex gap-2">
              <span className="font-bold text-yellow-400">1.</span>
              <span>
                Click <strong className="text-white">{label}</strong> — your notes are
                copied and NotebookLM opens in a new tab.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-400">2.</span>
              <span>
                Paste your notes into NotebookLM as a source.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-400">3.</span>
              <span>
                Click <strong className="text-white">COPY PROMPT</strong>, then paste it
                into NotebookLM&apos;s chat. It replies with flashcards as JSON.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-yellow-400">4.</span>
              <span>
                Copy that JSON and import it back into StudyMax via the JSON
                import option.
              </span>
            </li>
          </ol>
          <p className="mt-3 border-t border-zinc-800 pt-2 text-[10px] uppercase tracking-widest text-muted-fg">
            Turns any notes into study cards — no manual typing.
          </p>
        </div>
      )}
    </div>
  );
}
