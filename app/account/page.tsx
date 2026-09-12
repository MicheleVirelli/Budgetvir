import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/auth";
import BottomNav from "@/components/BottomNav";
import AccountForm from "./AccountForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 pb-2 pt-6">
        <h1 className="text-2xl font-bold">Account</h1>
      </header>

      <main className="flex-1 px-4 pb-24">
        <AccountForm profile={profile} />
      </main>

      <BottomNav />
    </div>
  );
}
