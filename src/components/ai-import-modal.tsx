"use client";
import { useState } from "react";
import { Clipboard, Sparkles, Check, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Button, Modal } from "./ui";
import { bulkCreateFlashcards } from "@/app/actions";
import { NOTEBOOKLM_IMPORT_PROMPT } from "@/lib/ai-import";
import { useRouter } from "next/navigation";

type Phase = "idle" | "importing" | "done" | "error";

export function AiImportModal({
  bundleId,
  bundleName,
  onClose,
  onImported,
}: {
  bundleId: string;
  bundleName: string;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pasted, setPasted] = useState("");
  const [created, setCreated] = useState(0);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  // Live detection of how many cards are in the pasted JSON, for the
  // "IMPORT N CARDS" label.
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

  const close = () => {
    setOpen(false);
    // Allow the close animation to play before unmounting
    setTimeout(onClose, 150);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(NOTEBOOKLM_IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = NOTEBOOKLM_IMPORT_PROMPT;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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
      // Re-fetch the parent list so the new cards show up without a
      // manual page refresh. Fallback to router.refresh if the caller
      // didn't provide a callback.
      try {
        if (onImported) await onImported();
        else router.refresh();
      } catch {
        /* parent re-fetch failed — cards are saved, user just won't
           see them until they refresh manually */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Body variants — each phase gets its own layout
  // ────────────────────────────────────────────────────────────────

  const promptStep = (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        STEP 01 — COPY THE PROMPT BELOW
      </p>
      <p className="text-sm text-muted-fg leading-relaxed">
        Paste this prompt into NotebookLM (or any chat LLM) along with your lesson.
        It returns a JSON array of <code className="font-mono text-accent">{"{front, back}"}</code> cards.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={copyPrompt}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          {copied ? "COPIED" : "COPY PROMPT"}
        </Button>
        <Button size="sm" variant="secondary" onClick={openNotebookLM}>
          <ExternalLink size={14} /> OPEN NOTEBOOKLM
        </Button>
      </div>
    </div>
  );

  const pasteStep = (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        STEP 02 — PASTE THE JSON BELOW
      </p>
      <textarea
        value={pasted}
        onChange={(e) => { setPasted(e.target.value); if (phase === "error") setPhase("idle"); }}
        placeholder={`[\n  { "front": "What is 2+2?", "back": "4" },\n  { "front": "...", "back": "..." }\n]`}
        className="w-full min-h-[200px] resize-y rounded-xl border-2 border-border bg-bg p-3 font-mono text-sm text-fg leading-relaxed placeholder:text-muted-fg/50 focus:border-accent focus:outline-none"
        spellCheck={false}
        autoComplete="off"
        aria-label="Paste NotebookLM JSON output"
      />
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest">
        <span className="text-muted-fg">
          {pasted.trim() ? (
            detectedCount > 0 ? (
              <>DETECTED · <span className="font-bold text-fg">{detectedCount}</span> CARD{detectedCount !== 1 ? "S" : ""}</>
            ) : (
              <span className="text-warning">UNREADABLE JSON — CHECK FORMAT</span>
            )
          ) : (
            "PASTE THE JSON HERE"
          )}
        </span>
        {pasted && (
          <button
            type="button"
            onClick={() => setPasted("")}
            className="text-muted-fg hover:text-fg"
          >
            CLEAR
          </button>
        )}
      </div>
    </div>
  );

  const errorBox = err ? (
    <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <p>{err}</p>
    </div>
  ) : null;

  const actionBar = (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={close}>
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
  );

  const doneScreen = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <Check size={18} className="shrink-0 mt-0.5 text-success" />
        <div>
          <p className="font-bold uppercase tracking-tight text-fg">
            IMPORTED {created} CARD{created !== 1 ? "S" : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-fg uppercase tracking-widest">
            ADDED TO {bundleName}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => router.push(`/bundles/${bundleId}/cards`)}>
          REVIEW CARDS
        </Button>
        <Button size="sm" onClick={close}>DONE</Button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title={`AI IMPORT · ${bundleName}`}>
      <div className="space-y-5">
        {phase === "done" ? doneScreen : (
          <>
            {promptStep}
            <div className="h-px w-full bg-border" aria-hidden />
            {pasteStep}
            {errorBox}
            {actionBar}
          </>
        )}
      </div>
    </Modal>
  );
}
