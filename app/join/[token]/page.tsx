import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/auth";
import JoinClient from "./JoinClient";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const me = await getSessionProfile();
  if (!me) redirect(`/login?next=/join/${token}`);

  return <JoinClient token={token} />;
}
