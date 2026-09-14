"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { profileName } from "@/lib/balances";
import { toCents, fromCents } from "@/lib/split";
import { parseCsv } from "@/lib/csv";
import {
  interpretSplitwiseCsv,
  reconstructExpense,
  mapCategory,
  normalizeDate,
  parseMoney,
  type ParsedImport,
  type NetInput,
} from "@/lib/importSplitwise";
import BackHeader from "@/components/BackHeader";

const IGNORE = "__ignore__";
const CREATE = "__create__";

export default function ImportClient({
  groupId,
  members,
  meId,
  defaultCurrency,
}: {
  groupId: string;
  members: Profile[];
  meId: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function autoMap(p: ParsedImport): Record<number, string> {
    const m: Record<number, string> = {};
    for (const col of p.personColumns) {
      const name = col.name.toLowerCase();
      const match = members.find(
        (mem) =>
          profileName(mem).toLowerCase() === name ||
          mem.email?.toLowerCase() === name ||
          mem.email?.split("@")[0].toLowerCase() === name ||
          profileName(mem).toLowerCase().startsWith(name.split(" ")[0]),
      );
      // Unmatched people default to "create as placeholder" so importing a
      // Splitwise group also brings its people in.
      m[col.index] = match ? match.id : CREATE;
    }
    return m;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      const p = interpretSplitwiseCsv(matrix);
      if (!p) {
        setError("Couldn't read this file. Make sure it's a Splitwise CSV export (with a Description and Cost column).");
        return;
      }
      setParsed(p);
      setMapping(autoMap(p));
    } catch {
      setError("Could not read the file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const validRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.filter((r) => {
      const desc = (r[parsed.fixed.description] ?? "").trim();
      const cost = parseMoney(r[parsed.fixed.cost] ?? "");
      return desc !== "" && desc.toLowerCase() !== "total balance" && cost > 0;
    });
  }, [parsed]);

  async function runImport() {
    if (!parsed) return;
    setError(null);

    // Resolve the mapping: create placeholder members for any column marked
    // "create", so their column can point at a real member id.
    const effective: Record<number, string> = { ...mapping };
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      for (const col of parsed.personColumns) {
        if (mapping[col.index] !== CREATE) continue;
        const id = crypto.randomUUID();
        const { error: pErr } = await supabase.from("profiles").insert({
          id,
          display_name: col.name || "Member",
          email: null,
          is_placeholder: true,
          created_by: user.id,
        });
        if (pErr) throw pErr;
        const { error: mErr } = await supabase
          .from("group_members")
          .insert({ group_id: groupId, user_id: id });
        if (mErr) throw mErr;
        effective[col.index] = id;
      }
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : "Could not create members.") +
          " If this mentions is_placeholder, run migration 0005 in Supabase first.",
      );
      return;
    }

    let done = 0;
    let failed = 0;
    setProgress({ done: 0, total: validRows.length });

    for (const r of validRows) {
      const costCents = toCents(parseMoney(r[parsed.fixed.cost]));
      const title = r[parsed.fixed.description].trim();
      const category = mapCategory(parsed.fixed.category >= 0 ? r[parsed.fixed.category] : "");
      const currency = (parsed.fixed.currency >= 0 ? r[parsed.fixed.currency] : "").trim().toUpperCase() || defaultCurrency;
      const expenseDate = normalizeDate(parsed.fixed.date >= 0 ? r[parsed.fixed.date] : "");

      // Build per-member nets from the mapped columns.
      const netByMember = new Map<string, number>();
      for (const col of parsed.personColumns) {
        const memberId = effective[col.index];
        if (!memberId || memberId === IGNORE || memberId === CREATE) continue;
        const cents = toCents(parseMoney(r[col.index] ?? ""));
        netByMember.set(memberId, (netByMember.get(memberId) ?? 0) + cents);
      }
      const nets: NetInput[] = [...netByMember.entries()].map(([userId, cents]) => ({ userId, cents }));
      const recon = reconstructExpense(costCents, nets);
      if (!recon) {
        failed++;
        done++;
        setProgress({ done, total: validRows.length });
        continue;
      }

      const { data: exp, error: eErr } = await supabase
        .from("expenses")
        .insert({
          group_id: groupId,
          title,
          category,
          amount: fromCents(costCents),
          currency,
          paid_by: recon.paidBy,
          split_type: "amount",
          expense_date: expenseDate,
          created_by: meId,
        })
        .select("id")
        .single();
      if (eErr || !exp) {
        failed++;
        done++;
        setProgress({ done, total: validRows.length });
        continue;
      }

      const { error: sErr } = await supabase.from("expense_splits").insert(
        recon.splits.map((s) => ({
          expense_id: exp.id,
          user_id: s.userId,
          amount_owed: fromCents(s.owedCents),
          raw_value: fromCents(s.owedCents),
        })),
      );
      if (sErr) failed++;

      done++;
      setProgress({ done, total: validRows.length });
    }

    setResult(`Imported ${done - failed} of ${validRows.length} expenses${failed ? ` (${failed} skipped).` : "."}`);
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Import from Splitwise" />

      <div className="flex flex-col gap-5 px-4 py-5">
        {!parsed ? (
          <>
            <div className="rounded-2xl bg-surface p-4 text-sm text-muted">
              <p className="mb-2 font-medium text-text">How to export from Splitwise</p>
              <ol className="flex flex-col gap-1">
                <li>1. Open the group in Splitwise</li>
                <li>2. Tap the gear ⚙️ → <b>Export as spreadsheet</b> (CSV)</li>
                <li>3. Upload that file below</li>
              </ol>
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-brand py-3 font-semibold text-black"
            >
              Choose CSV file
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
            {error && <p className="text-sm text-danger">{error}</p>}
          </>
        ) : result ? (
          <div className="flex flex-col items-center gap-4 pt-10 text-center">
            <div className="text-4xl">✅</div>
            <p className="font-medium">{result}</p>
            <button
              onClick={() => router.replace(`/groups/${groupId}`)}
              className="rounded-full bg-brand px-6 py-3 font-semibold text-black"
            >
              View group
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-1 font-medium">Match people to members</p>
              <p className="mb-3 text-sm text-muted">
                We found {parsed.personColumns.length} people and {validRows.length} expenses in the file.
              </p>
              <ul className="flex flex-col gap-2">
                {parsed.personColumns.map((col) => (
                  <li key={col.index} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{col.name}</span>
                    <span className="text-muted">→</span>
                    <select
                      value={mapping[col.index] ?? IGNORE}
                      onChange={(e) => setMapping((m) => ({ ...m, [col.index]: e.target.value }))}
                      className="max-w-[55%] rounded-lg border border-border bg-bg px-2 py-1.5 text-sm outline-none"
                    >
                      <option value={CREATE}>➕ Create “{col.name}”</option>
                      {members.map((mem) => (
                        <option key={mem.id} value={mem.id}>
                          {mem.id === meId ? "You" : profileName(mem)}
                        </option>
                      ))}
                      <option value={IGNORE}>Ignore</option>
                    </select>
                  </li>
                ))}
              </ul>
            </div>

            {progress ? (
              <div className="rounded-xl bg-surface p-4 text-center text-sm">
                Importing… {progress.done}/{progress.total}
              </div>
            ) : (
              <button
                onClick={runImport}
                disabled={validRows.length === 0}
                className="rounded-full bg-brand py-3 font-semibold text-black disabled:opacity-50"
              >
                Import {validRows.length} expenses
              </button>
            )}

            <button onClick={() => setParsed(null)} className="text-sm text-muted">
              Choose a different file
            </button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
