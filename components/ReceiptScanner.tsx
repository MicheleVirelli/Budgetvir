"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, GroupCategory } from "@/lib/types";
import { buildCategoryList } from "@/lib/categories";
import { toCents, fromCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import { parseReceiptText, computeItemizedOwed } from "@/lib/receipt";
import BackHeader from "@/components/BackHeader";
import CategoryPicker from "@/components/CategoryPicker";

const CURRENCIES = ["EUR", "USD", "GBP"];

interface Item {
  id: string;
  description: string;
  price: string; // currency units, editable
  memberIds: string[];
}

function parseNum(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Prepare a photo for OCR. Two things matter for phone snaps of receipts:
 *  - Orientation: Tesseract's own image decoder ignores EXIF orientation, so a
 *    portrait photo is read sideways and comes out as vertical gibberish. We
 *    decode through the browser (which honours EXIF) and re-draw upright.
 *  - Legibility: grayscale + a full-range contrast stretch makes faded thermal
 *    print stand out from the paper (and from a busy background); we also
 *    normalise the size to a resolution Tesseract reads well.
 * Returns a Blob for recognition; falls back to the original file on any error.
 */
async function preprocessReceipt(file: File): Promise<Blob> {
  try {
    let source: CanvasImageSource;
    let sw: number;
    let sh: number;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      source = bmp;
      sw = bmp.width;
      sh = bmp.height;
    } catch {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = URL.createObjectURL(file);
      });
      source = img;
      sw = img.naturalWidth;
      sh = img.naturalHeight;
    }
    if (!sw || !sh) return file;

    const target = 1600; // good working resolution; upscale small snaps up to 2×
    const scale = Math.min(2, target / sw);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, w, h);

    try {
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        d[i] = d[i + 1] = d[i + 2] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      const range = max - min || 1;
      for (let i = 0; i < d.length; i += 4) {
        const v = ((d[i] - min) * 255) / range;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // getImageData may throw on a tainted canvas — keep the drawn image as-is.
    }

    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b || file), "image/png"),
    );
  } catch {
    return file;
  }
}

export default function ReceiptScanner({
  groupId,
  members,
  meId,
  defaultCurrency,
  groupCategories = [],
}: {
  groupId: string;
  members: Profile[];
  meId: string;
  defaultCurrency: string;
  groupCategories?: GroupCategory[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const categoryList = buildCategoryList(groupCategories);

  const [step, setStep] = useState<"capture" | "ocr" | "review">("capture");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("Receipt");
  const [category, setCategory] = useState("dining");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paidBy, setPaidBy] = useState(meId);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allIds = useMemo(() => members.map((m) => m.id), [members]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStep("ocr");
    setProgress(0);
    setOcrNote(null);

    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("ita+eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(m.progress);
        },
      });
      // PSM 6 = assume a single uniform block of text: the recommended mode for a
      // receipt (one column of lines) — the default page-segmentation fragments
      // the description/price columns.
      await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
      const processed = await preprocessReceipt(f);
      const { data } = await worker.recognize(processed);
      await worker.terminate();

      const text = data.text || "";
      setRawText(text);
      const parsed = parseReceiptText(text);
      const newItems: Item[] = parsed.items.map((it, i) => ({
        id: `${Date.now()}-${i}`,
        description: it.description,
        price: (it.priceCents / 100).toFixed(2),
        memberIds: [...allIds],
      }));

      if (newItems.length === 0 && parsed.totalCents && parsed.totalCents > 0) {
        // Couldn't split into line items, but we found a total — seed it as a
        // single item so the amount is captured and can be assigned/split.
        newItems.push({
          id: `${Date.now()}-total`,
          description: "Receipt total",
          price: (parsed.totalCents / 100).toFixed(2),
          memberIds: [...allIds],
        });
        setOcrNote("Couldn't read individual items, but caught the total — check it and split, or tap “+ Add” for line items.");
      } else if (newItems.length === 0) {
        setOcrNote("Couldn't read this receipt automatically — add items below (or check the scanned text).");
      }
      setItems(newItems);
    } catch {
      setOcrNote("OCR failed on this image — you can still enter items manually.");
      setItems([]);
    } finally {
      setStep("review");
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function toggleMember(id: string, memberId: string) {
    setItems((list) =>
      list.map((it) => {
        if (it.id !== id) return it;
        const has = it.memberIds.includes(memberId);
        return { ...it, memberIds: has ? it.memberIds.filter((m) => m !== memberId) : [...it.memberIds, memberId] };
      }),
    );
  }
  function addItem() {
    setItems((l) => [...l, { id: `${Date.now()}`, description: "", price: "", memberIds: [...allIds] }]);
  }
  function removeItem(id: string) {
    setItems((l) => l.filter((it) => it.id !== id));
  }

  const owed = useMemo(() => {
    return computeItemizedOwed(
      items.map((it) => ({ priceCents: toCents(parseNum(it.price)), memberIds: it.memberIds })),
    );
  }, [items]);

  const totalCents = items.reduce((s, it) => s + toCents(parseNum(it.price)), 0);
  const unassigned = items.some((it) => toCents(parseNum(it.price)) !== 0 && it.memberIds.length === 0);
  const canSave = totalCents > 0 && !unassigned && title.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      // Upload the receipt image.
      let receiptUrl: string | null = null;
      if (file) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("receipts")
            .upload(path, file, { upsert: true, contentType: file.type });
          if (!upErr) receiptUrl = supabase.storage.from("receipts").getPublicUrl(path).data.publicUrl;
        }
      }

      const { data: exp, error: eErr } = await supabase
        .from("expenses")
        .insert({
          group_id: groupId,
          title: title.trim(),
          category,
          amount: fromCents(totalCents),
          currency,
          paid_by: paidBy,
          split_type: "amount",
          receipt_url: receiptUrl,
          expense_date: expenseDate,
          created_by: meId,
        })
        .select("id")
        .single();
      if (eErr) throw eErr;

      const splitRows = [...owed.entries()]
        .filter(([, cents]) => cents !== 0)
        .map(([userId, cents]) => ({
          expense_id: exp.id,
          user_id: userId,
          amount_owed: fromCents(cents),
          raw_value: fromCents(cents),
        }));
      const { error: sErr } = await supabase.from("expense_splits").insert(splitRows);
      if (sErr) throw sErr;

      router.replace(`/groups/${groupId}/expenses/${exp.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  // ---- Render ----
  if (step === "capture") {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title="Scan receipt" />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface text-4xl">🧾</div>
          <p className="text-sm text-muted">
            Take a photo of the receipt or pick one from your gallery. We&apos;ll read the items so you can assign them to people.
          </p>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <button onClick={() => cameraRef.current?.click()} className="rounded-full bg-brand px-8 py-3 font-semibold text-black">
              📷 Take photo
            </button>
            <button onClick={() => galleryRef.current?.click()} className="rounded-full border border-border bg-surface px-8 py-3 font-semibold">
              🖼️ Choose from gallery
            </button>
          </div>
          {/* Camera capture (rear camera) vs. plain file picker for the gallery.
              Two inputs because the `capture` attribute, when present, makes some
              mobile browsers skip the gallery and open the camera directly. */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          <input ref={galleryRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        </div>
      </div>
    );
  }

  if (step === "ocr") {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title="Reading receipt…" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="receipt" className="max-h-56 rounded-xl border border-border object-contain" />
          )}
          <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-sm text-muted">Reading text… {Math.round(progress * 100)}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="Assign items"
        action={
          <button onClick={save} disabled={!canSave} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        }
      />

      <div className="flex flex-col gap-4 px-4 py-4">
        {ocrNote && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface px-3 py-2">
            <p className="text-xs text-muted">{ocrNote}</p>
            <button
              onClick={() => { setStep("capture"); setItems([]); setOcrNote(null); setRawText(""); }}
              className="self-start text-xs font-medium text-brand"
            >
              ↻ Scan a different photo
            </button>
          </div>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
        />

        <div className="flex gap-2">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-xl border border-border bg-surface px-3 py-3 outline-none">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="flex-1 rounded-xl border border-border bg-surface px-3 py-3 outline-none">
            {members.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? "You paid" : `${profileName(m)} paid`}</option>)}
          </select>
        </div>

        <CategoryPicker value={category} onChange={setCategory} categories={categoryList} />

        {/* Items */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted">Items — tap avatars to assign</p>
            <button onClick={addItem} className="text-sm text-brand">+ Add</button>
          </div>

          {items.length === 0 && <p className="text-sm text-muted">No items yet — tap “+ Add”.</p>}

          {items.map((it) => (
            <div key={it.id} className="rounded-2xl bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={it.description}
                  onChange={(e) => updateItem(it.id, { description: e.target.value })}
                  placeholder="Item"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-2 text-sm outline-none focus:border-brand"
                />
                <div className="flex w-24 items-center gap-1 rounded-lg border border-border bg-bg px-2 py-2">
                  <input
                    value={it.price}
                    onChange={(e) => updateItem(it.id, { price: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="w-full min-w-0 bg-transparent text-right text-sm outline-none"
                  />
                </div>
                <button onClick={() => removeItem(it.id)} aria-label="Remove" className="text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = it.memberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMember(it.id, m.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${on ? "bg-brand text-black" : "bg-surface-2 text-muted"}`}
                    >
                      {m.id === meId ? "You" : profileName(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {unassigned && <p className="text-sm text-danger">Every item with a price needs at least one person.</p>}

        {/* Totals */}
        <div className="rounded-2xl bg-surface p-4">
          <div className="mb-2 flex items-center justify-between font-semibold">
            <span>Total</span>
            <span>{formatMoney(totalCents, currency)}</span>
          </div>
          <ul className="flex flex-col gap-1">
            {members.map((m) => {
              const c = owed.get(m.id) ?? 0;
              if (c === 0) return null;
              return (
                <li key={m.id} className="flex items-center justify-between text-sm text-muted">
                  <span>{m.id === meId ? "You" : profileName(m)}</span>
                  <span>{formatMoney(c, currency)}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {rawText.trim() && (
          <details className="rounded-2xl bg-surface p-3 text-xs text-muted">
            <summary className="cursor-pointer select-none font-medium">Scanned text</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text/80">
              {rawText.trim()}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
