"use client";
import { useEffect, useState } from "react";
import { Clipboard, Sparkles, Check, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "./ui";
import { bulkCreateFlashcards } from "@/app/actions";
import { NOTEBOOKLM_IMPORT_PROMPT } from "@/lib/ai-import";
import { useRouter } from "next/navigation";

type Phase = "idle" | "importing" | "done" | "error";

export function AiImportModal({
  bundleId,
  bundleName,
  onClose,
}: {
  bundleId: string;
  bundleName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pasted, setPasted] = useState("");
  const [created, setCreated] = useState(0);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Try to count cards in pasted text for a live preview of "IMPORT N CARDS"
  const detectedCount = (() => {
    if (!pasted.trim()) return 0;
    try {
      const stripped = pasted.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "");
      const p = JSON.parse(stripped);
      if (Array.isArray(p)) return p.length;
      if (Array.isArray(p?.cards)) return p.cards.length;
      return 0;
    } catch {
      return 0;
    }
  })();

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(NOTEBOOKLM_IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text in a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = NOTEBOOKLM_IMPORT_PROMPT;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openNotebookLM = () => {
    window.open("https://notebook.google.com/", "_blank", "noopener,noreferrer");
  };

  const importNow = async () => {
    if (!pasted.trim()) { setErr("Paste some JSON first."); setPhase("error"); return; }
    setPhase("importing");
    setErr("");
    try {
      const r = await bulkCreateFlashcards(bundleId, pasted);
      if (!r.ok) { setErr(r.error || "Import failed."); setPhase("error"); return; }
      setCreated(r.created);
      setPhase("done");
      // Refresh any server-rendered data on the page so the new cards show up
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import from NotebookLM"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass max-w-3xl w-full max-h-[90vh] flex flex-col p-6">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold uppercase tracking-tighter text-fg">
            IMPORT INTO <span className="text-accent">{bundleName}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-fg hover:text-fg text-2xl leading-none"
          >
            ×
          </button>
        </header>

        {phase === "done" ? (
          <div className="space-y-4 text-fg">
            <div className="flex items-center gap-2 border border-success/40 bg-success/10 p-3">
              <Check size={16} className="text-success" />
              <p className="text-sm font-bold uppercase tracking-widest">
                IMPORTED {created} CARD{created !== 1 ? "S" : ""} INTO {bundleName}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => router.push(`/bundles/${bundleId}/cards`)}>
                REVIEW CARDS
              </Button>
              <Button size="sm" onClick={onClose}>DONE</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Step 1 — copy the prompt */}
            <div className="mb-4">
              <p className="mb-2 text-xs text-muted-fg uppercase tracking-widest">
                STEP 1 — COPY THE PROMPT BELOW
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyPrompt}
                  aria-label="Copy NotebookLM import prompt"
                >
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}
                  {copied ? "COPIED" : "COPY PROMPT"}
                </Button>
                <Button variant="secondary" size="sm" onClick={openNotebookLM}>
                  <ExternalLink size={14} /> OPEN NOTEBOOKLM
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-fg">
                Paste the prompt into NotebookLM (or any LLM) along with your lesson. It will return a JSON array of <code className="font-mono text-accent">{"{ front, back }"}</code> cards.
              </p>
            </div>

            {/* Step 2 — paste the JSON */}
            <div className="flex-1 min-h-0 flex flex-col">
              <p className="mb-2 text-xs text-muted-fg uppercase tracking-widest">
                STEP 2 — PASTE THE JSON BELOW
              </p>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={`[\n  { "front": "What is 2+2?", "back": "4" },\n  { "front": "...", "back": "..." }\n]`}
                className="flex-1 min-h-[220px] bg-bg border border-border p-3 font-mono text-sm text-fg leading-relaxed resize-y"
                spellCheck={false}
                autoComplete="off"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-muted-fg uppercase tracking-widest">
                  {pasted.trim() ? (
                    detectedCount > 0
                      ? <>DETECTED: <span className="text-fg font-bold">{detectedCount}</span> CARD{detectedCount !== 1 ? "S" : ""}</>
                      : <>UNREADABLE JSON — CHECK FORMAT</>
                  ) : (
                    "PASTE THE JSON HERE"
                  )}
                </p>
                {pasted && (
                  <button
                    onClick={() => setPasted("")}
                    className="text-[11px] text-muted-fg hover:text-fg uppercase tracking-widest"
                  >
                    CLEAR
                  </button>
                )}
              </div>
            </div>

            {phase === "error" && err && (
              <div className="mt-3 flex items-start gap-2 border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>{err}</p>
              </div>
            )}

            {/* Action bar */}
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={onClose}>
                CANCEL
              </Button>
              <Button
                size="sm"
                onClick={importNow}
                disabled={phase === "importing" || !pasted.trim() || detectedCount === 0}
              >
                {phase === "importing" ? (
                  <><Loader2 size={14} className="animate-spin" /> IMPORTING…</>
                ) : (
                  <><Sparkles size={14} /> IMPORT {detectedCount > 0 ? `${detectedCount} ` : ""}CARD{detectedCount !== 1 ? "S" : ""}</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
