"use client";

import { useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";

export default function CategoryPicker({
  value,
  onChange,
  categories = CATEGORIES,
}: {
  value: string;
  onChange: (key: string) => void;
  categories?: Category[];
}) {
  const [open, setOpen] = useState(false);
  const current = categories.find((c) => c.key === value) ?? categories[0];

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
        <div className="absolute z-30 mt-1 grid max-h-72 w-full grid-cols-2 gap-1 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-2 shadow-xl">
          {categories.map((c) => (
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
