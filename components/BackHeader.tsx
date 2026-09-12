"use client";

import { useRouter } from "next/navigation";

export default function BackHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
      <button
        onClick={() => router.back()}
        aria-label="Back"
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-text active:bg-surface"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {action}
    </header>
  );
}
