"use client";

import { cn } from "@/lib/utils";
import type { CardKind } from "@/lib/db";

// Shared kind selector + per-kind extras for every card create/edit modal:
// BASIC (plain front/back), CLOZE ({{blanks}} hidden until flip),
// CHOICE (multiple-choice distractors; back = correct answer).
export function CardKindFields({
  kind,
  onKindChange,
  choicesText,
  onChoicesTextChange,
}: {
  kind: CardKind;
  onKindChange: (k: CardKind) => void;
  choicesText: string;
  onChoicesTextChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">CARD TYPE</label>
      <div className="grid grid-cols-3 gap-2">
        {(["basic", "cloze", "choice"] as CardKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKindChange(k)}
            className={cn(
              "border-2 px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
              kind === k ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-fg hover:border-fg"
            )}
          >
            {k}
          </button>
        ))}
      </div>
      {kind === "cloze" && (
        <p className="text-[10px] uppercase tracking-widest text-muted-fg">
          WRAP EACH BLANK IN {"{{...}}"} — E.G. THE CAPITAL OF FRANCE IS {"{{PARIS}}"}. BLANKS HIDE UNTIL YOU FLIP.
        </p>
      )}
      {kind === "choice" && (
        <textarea
          value={choicesText}
          onChange={(e) => onChoicesTextChange(e.target.value)}
          placeholder={"WRONG OPTIONS, ONE PER LINE (MIN 2).\nTHE BACK FIELD IS THE CORRECT ANSWER."}
          rows={3}
          className="w-full border-2 border-border bg-bg px-3 py-2 text-sm font-bold uppercase tracking-tight text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
      )}
    </div>
  );
}
