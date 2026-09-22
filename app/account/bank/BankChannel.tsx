"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BankConnection, BankTransaction } from "@/lib/types";
import TransactionRow from "./TransactionRow";

interface GroupRow {
  id: string;
  name: string;
}
interface Institution {
  name: string;
  country: string;
  logo: string | null;
}

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function monthLabel(date: string | null): string {
  if (!date) return "Undated";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "Undated" : MONTH_FMT.format(d);
}

export default function BankChannel({
  connections,
  transactions,
  groups,
}: {
  connections: BankConnection[];
  transactions: BankTransaction[];
  groups: GroupRow[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [picking, setPicking] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (search.get("connected")) setNote("Bank connected — tap “Sync now” to load transactions.");
    const err = search.get("error");
    if (err) setNote(`Couldn't connect: ${err.replace(/_/g, " ")}.`);
  }, [search]);

  const groupName = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const linked = connections.filter((c) => c.status === "linked");

  const byMonth = useMemo(() => {
    const out: { label: string; items: BankTransaction[] }[] = [];
    for (const t of transactions) {
      const label = monthLabel(t.booking_date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(t);
      else out.push({ label, items: [t] });
    }
    return out;
  }, [transactions]);

  async function openPicker() {
    setPicking(true);
    setNote(null);
    if (institutions) return;
    try {
      const res = await fetch("/api/bank/institutions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setInstitutions(data.aspsps ?? []);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't load banks.");
      setPicking(false);
    }
  }

  async function connect(aspsp: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspsp }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "failed");
      window.location.href = data.url; // → bank SCA
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't start the connection.");
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/bank/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setNote(
        data.added > 0
          ? `Synced ${data.added} new transaction${data.added === 1 ? "" : "s"}.`
          : "You're up to date.",
      );
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm("Disconnect this bank and remove its transactions?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bank/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't disconnect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {note && <p className="rounded-xl bg-surface px-3 py-2 text-xs text-muted">{note}</p>}

      {/* Connected banks */}
      {linked.length > 0 && (
        <div className="flex flex-col gap-2">
          {linked.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span className="flex items-center gap-2 font-medium">
                <span>🏦</span> {c.aspsp_name}
              </span>
              <button onClick={() => disconnect(c.id)} disabled={busy} className="text-xs text-danger">
                Disconnect
              </button>
            </div>
          ))}
          <button
            onClick={sync}
            disabled={busy}
            className="rounded-full bg-brand py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Working…" : "↻ Sync now"}
          </button>
        </div>
      )}

      {/* Connect a (new) bank */}
      {!picking ? (
        <button
          onClick={openPicker}
          className="rounded-xl border border-dashed border-border bg-surface py-3 text-sm font-medium text-brand"
        >
          {linked.length > 0 ? "＋ Connect another bank" : "🔗 Connect your bank"}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Choose your bank</span>
            <button onClick={() => setPicking(false)} className="text-xs text-muted">
              Cancel
            </button>
          </div>
          {institutions === null ? (
            <p className="py-4 text-center text-sm text-muted">Loading banks…</p>
          ) : institutions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No banks available.</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
              {institutions.map((inst) => (
                <li key={inst.name}>
                  <button
                    onClick={() => connect(inst.name)}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm active:bg-surface-2 disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {inst.logo ? <img src={inst.logo} alt="" className="h-5 w-5 rounded" /> : <span>🏦</span>}
                    <span className="truncate">{inst.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Transactions channel */}
      {transactions.length === 0 ? (
        <p className="pt-6 text-center text-sm text-muted">
          {linked.length > 0
            ? "No transactions yet — tap “Sync now”."
            : "Connect a card to see your transactions here."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {byMonth.map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted">{group.label}</p>
              {group.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  groups={groups}
                  addedGroupName={t.added_group_id ? groupName.get(t.added_group_id) ?? "a group" : null}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="pt-2 text-center text-[11px] leading-relaxed text-muted">
        Connected via Enable Banking, a licensed EU open-banking provider. Your bank login is
        entered only on your bank&apos;s site — Budgetvir never sees it.
      </p>
    </div>
  );
}
