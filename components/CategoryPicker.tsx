"use client";

import { useState } from "react";
import { CATEGORIES, getCategory } from "@/lib/categories";

export default function CategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = getCategory(value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3"
      >
        <span className="text-sm text-muted">Category</span>
        <span className="flex items-center gap-2 font-medium">
          <span>{current.emoji}</span>
          {current.label}
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 grid w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-surface-2 p-2 shadow-xl">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                onChange(c.key);
                setOpen(false);
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                c.key === value ? "bg-brand text-black" : "hover:bg-surface"
              }`}
            >
              <span>{c.emoji}</span>
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
