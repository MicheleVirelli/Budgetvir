"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";

interface Preview {
  id: string;
  name: string;
  image_url: string | null;
  member_count: number;
}

export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .rpc("group_preview_by_token", { token })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else if (!data || (data as Preview[]).length === 0) setError("This invite link is invalid or expired.");
        else setPreview((data as Preview[])[0]);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function join() {
    setJoining(true);
    setError(null);
    const { data, error } = await supabase.rpc("join_group_by_token", { token });
    if (error) {
      setError(error.message);
      setJoining(false);
      return;
    }
    router.replace(`/groups/${data}`);
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {loading ? (
        <p className="text-muted">Loading invite…</p>
      ) : error ? (
        <>
          <div className="text-4xl">🚫</div>
          <p className="text-danger">{error}</p>
          <Link href="/" className="rounded-full bg-brand px-5 py-2.5 font-semibold text-black">
            Go home
          </Link>
        </>
      ) : preview ? (
        <>
          <Avatar src={preview.image_url} name={preview.name} size={80} shapeSquare />
          <div>
            <p className="text-sm text-muted">You&apos;ve been invited to join</p>
            <h1 className="text-2xl font-bold">{preview.name}</h1>
            <p className="text-sm text-muted">{preview.member_count} people</p>
          </div>
          <button
            onClick={join}
            disabled={joining}
            className="rounded-full bg-brand px-8 py-3 font-semibold text-black disabled:opacity-60"
          >
            {joining ? "Joining…" : "Join group"}
          </button>
          <Link href="/" className="text-sm text-muted">
            Not now
          </Link>
        </>
      ) : null}
    </div>
  );
}
