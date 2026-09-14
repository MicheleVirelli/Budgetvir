import type { Activity, Profile } from "./types";
import { formatMoney, profileName } from "./balances";
import { toCents } from "./split";

/** Human-readable description of an activity row. */
export function describeActivity(
  a: Activity,
  members: Profile[],
): { icon: string; text: string } {
  const byId = (id: string | null | undefined) =>
    profileName(members.find((m) => m.id === id));
  const actor = byId(a.actor_id);
  const d = a.data as Record<string, string | number>;
  const money = (amt: unknown, cur: unknown) =>
    formatMoney(toCents(Number(amt) || 0), String(cur || "EUR"));

  switch (a.type) {
    case "expense_added":
      return { icon: "🧾", text: `${actor} added "${d.title}" (${money(d.amount, d.currency)})` };
    case "expense_updated":
      return { icon: "✏️", text: `${actor} updated "${d.title}"` };
    case "expense_deleted":
      return { icon: "🗑️", text: `${actor} deleted "${d.title}"` };
    case "settlement_added":
      return {
        icon: "💸",
        text: `${byId(String(d.from_user))} paid ${byId(String(d.to_user))} ${money(d.amount, d.currency)}`,
      };
    case "comment_added":
      return { icon: "💬", text: `${actor} commented: "${d.body}"` };
    case "member_joined": {
      const addedId = d.user_id != null ? String(d.user_id) : null;
      if (addedId && addedId !== a.actor_id) {
        return { icon: "👋", text: `${actor} added ${byId(addedId)}` };
      }
      return { icon: "👋", text: `${actor} joined the group` };
    }
    default:
      return { icon: "•", text: `${actor} did something` };
  }
}

export function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}
