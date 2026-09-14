"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import InstallButton from "@/components/InstallButton";

export default function InstallPage() {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const origin = window.location.origin;
    setUrl(origin);
    QRCode.toDataURL(origin, { width: 220, margin: 1, color: { dark: "#0f0f10", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-h-dvh flex-col px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/15 text-3xl">📲</div>
        <div>
          <h1 className="text-2xl font-bold">Install Budgetvir</h1>
          <p className="mt-1 text-sm text-muted">
            Add it to your home screen and it opens like a native app — full screen, works offline for the shell.
          </p>
        </div>

        <InstallButton className="rounded-full bg-brand px-6 py-3 font-semibold text-black" label="Install now" />

        {qr && (
          <div className="rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to open Budgetvir" width={200} height={200} />
          </div>
        )}

        <div className="flex w-full items-center gap-2 rounded-xl bg-surface p-2">
          <span className="min-w-0 flex-1 truncate px-2 text-sm text-muted">{url}</span>
          <button onClick={copy} className="shrink-0 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="w-full text-left">
          <Instructions
            title="iPhone / iPad (Safari)"
            steps={["Tap the Share button", "Choose “Add to Home Screen”", "Tap Add"]}
          />
          <Instructions
            title="Android (Chrome)"
            steps={['Tap “Install now” above, or the ⋮ menu', 'Choose “Install app” / “Add to Home screen”', "Confirm"]}
          />
          <Instructions
            title="Desktop (Chrome / Edge)"
            steps={['Click the install icon in the address bar', 'Or use “Install now” above']}
          />
        </div>

        <Link href="/" className="text-sm text-brand">
          ‹ Back to app
        </Link>
      </div>
    </div>
  );
}

function Instructions({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="mb-3 rounded-xl bg-surface p-4">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ol className="flex flex-col gap-1 text-sm text-muted">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
