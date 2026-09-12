"use client";

import { useState } from "react";

const EMOJIS = [
  "🧾", "🍽️", "🍕", "🍺", "☕", "🍷", "🛒", "🥐",
  "🚕", "✈️", "🚌", "⛽", "🏨", "🏠", "🎟️", "🎉",
  "🎁", "🛍️", "💊", "🧺", "🐶", "⚽", "🎮", "💡",
];

export default function EmojiPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-2xl"
        aria-label="Choose emoji"
      >
        {value || (
          <span className="text-muted">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0" />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-16 z-30 w-64 rounded-2xl border border-border bg-surface-2 p-3 shadow-xl">
          <div className="grid grid-cols-6 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-surface"
              >
                {e}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="mt-2 w-full rounded-lg py-1.5 text-sm text-muted hover:bg-surface"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
