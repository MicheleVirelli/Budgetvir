import { notFound, redirect } from "next/navigation";
import { getGroupMeta } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import ReceiptScanner from "@/components/ReceiptScanner";

export const dynamic = "force-dynamic";

export default async function ScanReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const meta = await getGroupMeta(id);
  if (!meta) notFound();

  return (
    <ReceiptScanner
      groupId={id}
      members={meta.members}
      meId={me.id}
      defaultCurrency={meta.group.default_currency ?? "EUR"}
      groupCategories={meta.categories}
    />
  );
}
