"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteExpenseButton({
  expenseId,
  groupId,
}: {
  expenseId: string;
  groupId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this expense?")) return;
    setBusy(true);
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) {
      alert(error.message);
      setBusy(false);
      return;
    }
    router.replace(`/groups/${groupId}`);
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      aria-label="Delete expense"
      className="flex h-9 w-9 items-center justify-center rounded-full text-danger active:bg-surface disabled:opacity-50"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      </svg>
    </button>
  );
}
