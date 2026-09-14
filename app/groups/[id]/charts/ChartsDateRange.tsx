"use client";

import { usePathname, useRouter } from "next/navigation";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ChartsDateRange({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function apply(f?: string, t?: string) {
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function preset(kind: "all" | "30d" | "3m" | "ytd") {
    const now = new Date();
    if (kind === "all") return apply(undefined, undefined);
    if (kind === "ytd") return apply(iso(new Date(now.getFullYear(), 0, 1)), iso(now));
    const d = new Date(now);
    d.setDate(d.getDate() - (kind === "30d" ? 30 : 90));
    apply(iso(d), iso(now));
  }

  const active = !from && !to;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto">
        <Chip on={active} onClick={() => preset("all")}>All time</Chip>
        <Chip onClick={() => preset("30d")}>Last 30d</Chip>
        <Chip onClick={() => preset("3m")}>3 months</Chip>
        <Chip onClick={() => preset("ytd")}>This year</Chip>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <input
          type="date"
          value={from ?? ""}
          onChange={(e) => apply(e.target.value || undefined, to)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 outline-none [color-scheme:dark]"
        />
        <span className="text-muted">→</span>
        <input
          type="date"
          value={to ?? ""}
          onChange={(e) => apply(from, e.target.value || undefined)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 outline-none [color-scheme:dark]"
        />
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
        on ? "bg-brand text-black" : "bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}
