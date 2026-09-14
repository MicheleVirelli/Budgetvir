import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
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

  const data = await getGroupData(id);
  if (!data) notFound();

  return (
    <ReceiptScanner
      groupId={id}
      members={data.members}
      meId={me.id}
      defaultCurrency={data.group.default_currency ?? "EUR"}
    />
  );
}
