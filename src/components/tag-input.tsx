"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}

/**
 * Multi-tag input: type + Enter or comma to add a chip,
 * click the × on a chip to remove it. Matches the ONF dark spec
 * (bg-zinc-800 text-yellow-400 pill badges).
 */
export function TagInput({ tags, onChange, placeholder, label }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim().replace(/,+$/, "");
    if (!t) { setDraft(""); return; }
    // split on commas if the user pasted a comma-separated list, else single tag
    const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
    const next = [...tags];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft("");
  };

  const removeTag = (target: string) => {
    onChange(tags.filter((t) => t !== target));
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">{label}</label>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-3 focus-within:border-yellow-400 transition-colors">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-xs font-bold text-yellow-400"
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              aria-label={`Remove ${t}`}
              className="text-zinc-500 hover:text-fg"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          onBlur={commit}
          placeholder={placeholder ?? "ADD TAG, PRESS ENTER"}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
        />
      </div>
    </div>
  );
}
