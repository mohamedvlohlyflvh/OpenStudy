"use client";

import { BUNDLE_COLORS } from "@/lib/bundle-colors";

export function BundleColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const isCustom = value && !BUNDLE_COLORS.includes(value.toUpperCase());
  return (
    <div className="space-y-3">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">COLOR</label>
      <div className="flex flex-wrap gap-2">
        {BUNDLE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Color ${c}`}
            className={`h-8 w-8 border-2 transition-all ${
              value.toUpperCase() === c.toUpperCase() ? "border-fg scale-110" : "border-transparent hover:border-muted-fg"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        {/* Custom color picker — any color you want */}
        <label
          className={`relative flex h-8 cursor-pointer items-center gap-1.5 border-2 px-2 transition-all ${
            isCustom ? "border-fg scale-105" : "border-dashed border-muted-fg hover:border-fg"
          }`}
          title="Custom color"
        >
          <span
            className="inline-block h-5 w-5 border border-muted-fg/50"
            style={isCustom ? { backgroundColor: value } : undefined}
          />
          <input
            type="color"
            value={value || "#DFE104"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="pointer-events-none text-[9px] font-bold uppercase tracking-widest text-muted-fg">
            {isCustom ? value : "CUSTOM"}
          </span>
        </label>
      </div>
    </div>
  );
}
