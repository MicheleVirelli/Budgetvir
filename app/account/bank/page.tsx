import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import BackHeader from "@/components/BackHeader";
import BankChannel from "./BankChannel";
import type { BankConnection, BankTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";

interface GroupRow {
  id: string;
  name: string;
}

export default async function BankPage() {
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();

  const [{ data: connRows }, { data: txRows }, { data: memberships }] = await Promise.all([
    supabase
      .from("bank_connections")
      .select("*")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bank_transactions")
      .select("*")
      .eq("user_id", me.id)
      .eq("dismissed", false)
      .order("booking_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("group_members").select("group:groups(id, name)").eq("user_id", me.id),
  ]);

  const groups: GroupRow[] = (memberships ?? [])
    .map((m) => (m as unknown as { group: GroupRow }).group)
    .filter(Boolean);

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Bank & cards" />
      <Suspense>
        <BankChannel
          connections={(connRows ?? []) as BankConnection[]}
          transactions={(txRows ?? []) as BankTransaction[]}
          groups={groups}
        />
      </Suspense>
    </div>
  );
}
