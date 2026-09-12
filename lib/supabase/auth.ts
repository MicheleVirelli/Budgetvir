import { createClient } from "./server";
import type { Profile } from "../types";

/**
 * Get the current auth user + their profile row (server-side).
 * Returns null when signed out.
 */
export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile) return profile as Profile;

  // Fallback if the trigger hasn't populated the row yet.
  return {
    id: user.id,
    email: user.email ?? "",
    display_name: (user.user_metadata?.display_name as string) ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
  };
}
