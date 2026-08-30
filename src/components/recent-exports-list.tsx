"use client";
import { useEffect, useState } from "react";
import { Download, Clipboard } from "lucide-react";
import { Button } from "./ui";
import { getRecentNotebookExports, redownloadNotebookExport, sendToNotebookLM } from "@/app/actions";
import type { NotebookExportRec } from "@/lib/notebooklm/schema";

function fmtTime(d: Date): string {
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export function RecentExportsList() {
  const [rows, setRows] = useState<NotebookExportRec[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecentNotebookExports(5).then((r) => { if (!cancelled) setRows(r); });
    return () => { cancelled = true; };
  }, []);

  if (rows === null) {
    return <p className="text-xs text-muted-fg uppercase tracking-widest">LOADING…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-xs text-muted-fg uppercase tracking-widest">NO EXPORTS YET — SEND A BUNDLE OR SUBJECT TO NOTEBOOKLM TO START.</p>;
  }

  const redownload = async (id: string) => {
    setBusyId(id);
    try { await redownloadNotebookExport(id); } finally { setBusyId(null); }
  };

  const recopyShareLink = async (rec: NotebookExportRec) => {
    setBusyId(rec.id);
    try {
      if (rec.transport === "share-link" && rec.shareUrl) {
        await navigator.clipboard.writeText(rec.shareUrl);
      } else {
        await sendToNotebookLM({
          kind: rec.kind, sourceId: rec.sourceId, title: rec.title,
          includeCards: true, includeNotes: true, includeSessions: false,
        }, "file-download");
      }
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-tighter text-fg">RECENT EXPORTS</h3>
      <ul className="divide-y divide-border border border-border bg-bg">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold uppercase tracking-tight text-fg">{r.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-fg uppercase tracking-widest">
                {r.kind} · {r.transport} · {fmtTime(r.createdAt)} · {(r.byteSize / 1024).toFixed(1)} KB
              </p>
            </div>
            <div className="flex gap-2">
              {r.transport === "share-link" && r.shareUrl && (
                <Button size="sm" variant="secondary" onClick={() => recopyShareLink(r)} disabled={busyId === r.id}>
                  <Clipboard size={14} /> COPY LINK
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => redownload(r.id)} disabled={busyId === r.id}>
                <Download size={14} /> {busyId === r.id ? "…" : "REDOWNLOAD"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
