"use client";
import { useEffect, useState } from "react";
import { Check, Clipboard, Download, ExternalLink, Link2, X } from "lucide-react";
import { Button } from "./ui";
import { useAppStore } from "@/lib/store";
import { sendToNotebookLM } from "@/app/actions";
import { buildNotebookSource } from "@/lib/notebooklm/format";
import { buildBundleSource, buildSubjectSource, buildNotesSetSource } from "@/lib/notebooklm/sources";
import type { NotebookTransportId } from "@/lib/notebooklm";

type Phase = "preview" | "downloaded" | "shared" | "error";

export function NotebookLabModal({ kind, id, fallbackTitle, onClose }: {
  kind: "bundle" | "subject" | "notes-set";
  id: string;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const shareEnabled = useAppStore((s) => s.notebookShareLinkEnabled);
  const [phase, setPhase] = useState<Phase>("preview");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState(fallbackTitle);
  const [err, setErr] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<NotebookTransportId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const builders: Record<string, (x: string) => Promise<{ title: string; body: string }>> = {
          bundle: buildBundleSource,
          subject: buildSubjectSource,
          "notes-set": (x: string) => buildNotesSetSource(x.split(",")),
        };
        const built = await builders[kind](id);
        setTitle(built.title);
        setBody(buildNotebookSource(
          { kind, sourceId: id, title: built.title, includeCards: true, includeNotes: true, includeSessions: false },
          built.body
        ));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
  }, [kind, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (transport: NotebookTransportId) => {
    setBusy(transport);
    setErr("");
    try {
      const r = await sendToNotebookLM(
        { kind, sourceId: id, title, includeCards: true, includeNotes: true, includeSessions: false },
        transport
      );
      if (!r.ok) { setErr(r.message); setPhase("error"); return; }
      if (transport === "share-link" && r.record.shareUrl) setShareUrl(r.record.shareUrl);
      setPhase(transport === "share-link" ? "shared" : "downloaded");
      // Replicate the old "open NotebookLM in a new tab on download" behavior —
      // users expect one click to do both: get the file AND get the destination.
      if (transport === "file-download") {
        window.open("https://notebook.google.com/", "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusy(null);
    }
  };

  const openNotebookLM = () => {
    window.open("https://notebook.google.com/", "_blank", "noopener,noreferrer");
  };

  const online = typeof navigator === "undefined" || navigator.onLine;

  return (
    <div role="dialog" aria-modal="true" aria-label="Send to NotebookLM"
         className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass max-w-4xl w-full max-h-[90vh] flex flex-col p-6">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold uppercase tracking-tighter text-fg">SEND TO NOTEBOOKLM</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-fg hover:text-fg"><X size={18} /></button>
        </header>

        {phase === "preview" && (
          <>
            <p className="mb-2 text-xs text-muted-fg uppercase tracking-widest">{title}</p>
            <textarea
              readOnly
              value={body}
              className="flex-1 min-h-[340px] bg-bg border border-border p-4 font-mono text-sm text-fg leading-relaxed"
            />
            <p className="mt-2 text-[11px] text-muted-fg uppercase tracking-widest">
              {body.length.toLocaleString()} CHARS · {new TextEncoder().encode(body).length.toLocaleString()} BYTES
            </p>

            {/0 flashcards|No notes\.|0 notes/.test(body) && (
              <p className="mt-2 text-xs text-warning">
                ⚠ THIS SOURCE IS EMPTY — NO CARDS OR NOTES FOUND. DOWNLOAD ANYWAY OR ADD CONTENT TO THIS {kind.toUpperCase()} FIRST.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(body)}>
                <Clipboard size={14} /> COPY
              </Button>
              <Button variant="secondary" size="sm" onClick={openNotebookLM}>
                <ExternalLink size={14} /> OPEN NOTEBOOKLM
              </Button>
              {shareEnabled && online && (
                <Button variant="secondary" size="sm" onClick={() => send("share-link")} disabled={busy !== null}>
                  <Link2 size={14} /> {busy === "share-link" ? "CREATING..." : "CREATE SHARE LINK"}
                </Button>
              )}
              <Button size="sm" onClick={() => send("file-download")} disabled={busy !== null}>
                <Download size={14} /> {busy === "file-download" ? "DOWNLOADING..." : "DOWNLOAD .MD"}
              </Button>
            </div>

            {!shareEnabled && (
              <p className="mt-2 text-[11px] text-muted-fg">
                SHARE LINK IS OFF — ENABLE IT IN <span className="text-fg">SETTINGS → NOTEBOOK LAB</span> TO UPLOAD VIA A PUBLIC URL INSTEAD OF A FILE.
              </p>
            )}
            {shareEnabled && !online && (
              <p className="mt-2 text-[11px] text-muted-fg">YOU&apos;RE OFFLINE — SHARE LINK DISABLED. DOWNLOAD STILL WORKS.</p>
            )}
          </>
        )}

        {phase === "downloaded" && (
          <ol className="space-y-3 text-sm text-fg">
            <li className="flex gap-3"><span className="text-accent font-bold">1.</span> Open NotebookLM (a new tab opened automatically if you clicked the button).</li>
            <li className="flex gap-3"><span className="text-accent font-bold">2.</span> Click <strong>Add source</strong> → <strong>Upload</strong> and pick the downloaded <code className="font-mono text-xs">.md</code> file.</li>
            <li className="flex gap-3"><span className="text-accent font-bold">3.</span> Close this dialog when you&apos;re done.</li>
            <li className="pt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={openNotebookLM}><ExternalLink size={14} /> OPEN NOTEBOOKLM</Button>
              <Button size="sm" onClick={onClose}><Check size={14} /> DONE</Button>
            </li>
          </ol>
        )}

        {phase === "shared" && (
          <div className="space-y-4 text-sm text-fg">
            <p>SHARE LINK CREATED — NotebookLM can ingest it as a website source.</p>
            <div className="flex items-center gap-2 border border-border bg-bg p-3">
              <code className="flex-1 truncate font-mono text-xs text-accent">{shareUrl}</code>
              <Button size="sm" variant="secondary" onClick={() => shareUrl && navigator.clipboard.writeText(shareUrl)}>
                <Clipboard size={14} /> COPY
              </Button>
            </div>
            <ol className="space-y-3">
              <li className="flex gap-3"><span className="text-accent font-bold">1.</span> Open NotebookLM and click <strong>Add source</strong> → <strong>Website</strong>.</li>
              <li className="flex gap-3"><span className="text-accent font-bold">2.</span> Paste the link above.</li>
              <li className="flex gap-3"><span className="text-accent font-bold">3.</span> Close this dialog when NotebookLM has ingested the source.</li>
            </ol>
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={openNotebookLM}><ExternalLink size={14} /> OPEN NOTEBOOKLM</Button>
              <Button size="sm" onClick={onClose}><Check size={14} /> DONE</Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            <p className="font-bold uppercase tracking-widest mb-2">EXPORT FAILED</p>
            <p>{err}</p>
            <p className="mt-2 text-muted-fg">You can still copy the source manually from the preview.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPhase("preview")}>BACK</Button>
              <Button size="sm" onClick={onClose}>CLOSE</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
