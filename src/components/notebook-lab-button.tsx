"use client";
import { useState } from "react";
import { Notebook } from "lucide-react";
import { NotebookLabModal } from "./notebook-lab-modal";
import { Button } from "./ui";

type Kind = "bundle" | "subject" | "notes-set";
export function NotebookLabButton({ kind, id, title }: { kind: Kind; id: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        aria-label={`Send to NotebookLM`}
        title="Send to NotebookLM"
      >
        <Notebook size={14} />
        <span className="hidden sm:inline">NOTEBOOKLM</span>
      </Button>
      {open && <NotebookLabModal kind={kind} id={id} fallbackTitle={title ?? ""} onClose={() => setOpen(false)} />}
    </>
  );
}
