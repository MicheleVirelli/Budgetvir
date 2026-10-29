"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GroupHeader from "./GroupHeader";

export default function GroupTabsShell({
  children,
  groupId,
  name,
  imageUrl,
  memberCount,
  summary,
}: {
  children: React.ReactNode;
  groupId: string;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  summary: string;
}) {
  const pathname = usePathname();

  // Full-screen flows that have their own custom BackHeader / navigation
  const isFullScreen =
    pathname.includes("/expenses/") ||
    pathname.endsWith("/settle") ||
    pathname.endsWith("/settings") ||
    pathname.endsWith("/recurring/new") ||
    pathname.endsWith("/import") ||
    pathname.endsWith("/export") ||
    pathname.endsWith("/categories") ||
    pathname.endsWith("/budget");

  if (isFullScreen) {
    return <>{children}</>;
  }

  // Active tab detection
  const isFeed = pathname === `/groups/${groupId}`;
  const isBalances = pathname.endsWith("/balances");
  const isCharts = pathname.endsWith("/charts");
  const isActivity = pathname.endsWith("/activity");
  const isRecurring = pathname.endsWith("/recurring");
  const isMembers = pathname.endsWith("/members");

  return (
    <div className="flex min-h-dvh flex-col pb-28">
      <GroupHeader
        groupId={groupId}
        name={name}
        imageUrl={imageUrl}
        memberCount={memberCount}
        summary={summary}
      />

      <nav aria-label="Group navigation" className="flex gap-2 overflow-x-auto px-4 py-3">
        <Chip href={`/groups/${groupId}`} active={isFeed}>
          Expenses
        </Chip>
        <Chip href={`/groups/${groupId}/settle`} accent>
          Settle up
        </Chip>
        <Chip href={`/groups/${groupId}/balances`} active={isBalances}>
          Balances
        </Chip>
        <Chip href={`/groups/${groupId}/charts`} active={isCharts}>
          Charts
        </Chip>
        <Chip href={`/groups/${groupId}/activity`} active={isActivity}>
          Activity
        </Chip>
        <Chip href={`/groups/${groupId}/recurring`} active={isRecurring}>
          Recurring
        </Chip>
        <Chip href={`/groups/${groupId}/members`} active={isMembers}>
          Members · {memberCount}
        </Chip>
      </nav>

      <main className="flex-1">{children}</main>

      <Link
        href={`/groups/${groupId}/expenses/new`}
        prefetch={true}
        className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand px-6 py-3.5 font-semibold text-black shadow-lg active:scale-95 transition-transform"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add expense
      </Link>
    </div>
  );
}

function Chip({
  href,
  children,
  accent,
  active,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
  active?: boolean;
}) {
  let style = "border border-border text-foreground active:bg-surface";
  if (active) {
    style = "bg-brand text-black font-semibold shadow-sm";
  } else if (accent) {
    style = "border border-brand/50 text-brand active:bg-brand/10";
  }

  return (
    <Link
      href={href}
      prefetch={true}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${style}`}
    >
      {children}
    </Link>
  );
}

