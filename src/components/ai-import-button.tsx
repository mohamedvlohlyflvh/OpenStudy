"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { AiImportModal } from "./ai-import-modal";
import { Button } from "./ui";

export function AiImportButton({
  bundleId,
  bundleName,
  onImported,
}: {
  bundleId: string;
  bundleName: string;
  onImported?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        aria-label="Import cards from NotebookLM"
        title="Import cards from NotebookLM"
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">AI IMPORT</span>
      </Button>
      {open && (
        <AiImportModal
          bundleId={bundleId}
          bundleName={bundleName}
          onClose={() => setOpen(false)}
          onImported={onImported}
        />
      )}
    </>
  );
}
