"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";

export default function GroupHeader({
  groupId,
  name,
  imageUrl,
  memberCount,
  summary,
}: {
  groupId: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  summary: string;
}) {
  const router = useRouter();

  return (
    <header className="relative">
      <div className="relative h-40 w-full overflow-hidden bg-surface-2">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-black/30" />

        <button
          onClick={() => router.push("/")}
          aria-label="Back"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        <Link
          href={`/groups/${groupId}/members`}
          aria-label="Members"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.2" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
            <path d="M15 19a4.5 4.5 0 0 1 5.5-4.4" />
          </svg>
        </Link>

        <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3">
          {!imageUrl && <Avatar name={name} size={44} shapeSquare />}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-white drop-shadow">{name}</h1>
            <p className="text-xs text-white/80">{memberCount} people</p>
          </div>
        </div>
      </div>

      <p className="px-4 pt-3 text-lg font-semibold">{summary}</p>
    </header>
  );
}
