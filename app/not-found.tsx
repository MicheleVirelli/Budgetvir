import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">🤷</div>
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/" className="mt-2 rounded-full bg-brand px-5 py-2.5 font-semibold text-black">
        Back to groups
      </Link>
    </div>
  );
}
