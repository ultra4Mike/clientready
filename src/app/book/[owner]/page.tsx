"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BOOKING_MAX_PHOTOS, bookingError, type BookingForm, type BookingPage } from "@/lib/booking";

/** Shrinks a photo to at most 1200px JPEG so it fits the request limit. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let q = 0.8;
      let out = canvas.toDataURL("image/jpeg", q);
      while (out.length > 440_000 && q > 0.3) { q -= 0.15; out = canvas.toDataURL("image/jpeg", q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

const empty: BookingForm = { name: "", phone: "", email: "", address: "", service: "", preferred: "", note: "", photos: [], website: "" };

/** Public online booking form (no sign-in). Minimal styling on purpose; Visual Design styles it later. */
export default function BookPage() {
  const params = useParams<{ owner: string }>();
  const owner = String(params?.owner || "");
  const router = useRouter();
  const [page, setPage] = useState<BookingPage | null | "missing">(null);
  const [form, setForm] = useState<BookingForm>(empty);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/book?owner=${encodeURIComponent(owner)}`).then(async (r) => (r.ok ? setPage((await r.json()) as BookingPage) : setPage("missing"))).catch(() => setPage("missing"));
  }, [owner]);

  const set = (key: keyof BookingForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = BOOKING_MAX_PHOTOS - form.photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, Math.max(room, 0));
    const shrunk = await Promise.all(picked.map((f) => shrink(f).catch(() => "")));
    setForm((f) => ({ ...f, photos: [...f.photos, ...shrunk.filter(Boolean)].slice(0, BOOKING_MAX_PHOTOS) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = bookingError(form, page && page !== "missing" ? page.services : []);
    setError(problem);
    if (problem) return;
    setSending(true);
    try {
      const r = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, ...form }) });
      const result = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && result.ok) { router.push(`/book/${encodeURIComponent(owner)}/thanks`); return; }
      setError(result.error || "Could not send your request. Please try again.");
    } catch {
      setError("Could not send your request. Please try again.");
    }
    setSending(false);
  }

  if (page === null) return <main className="mx-auto max-w-xl p-4" data-testid="book-loading">Loading…</main>;
  if (page === "missing") return <main className="mx-auto max-w-xl p-4" data-testid="book-unavailable"><p>Online booking isn&apos;t available for this business.</p></main>;

  const field = "mt-1 block w-full min-h-11 rounded border border-slate-300 px-3 py-2";
  return (
    <main className="mx-auto max-w-xl p-4" data-testid="book-page">
      <h1 className="text-xl font-bold" data-testid="book-business">{page.business}</h1>
      <p className="mt-1 text-sm">Request a service. We&apos;ll get back to you to confirm.</p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-3" data-testid="book-form">
        <label className="block">Name *<input data-testid="book-name" className={field} value={form.name} onChange={set("name")} autoComplete="name" maxLength={120} required /></label>
        <label className="block">Phone<input data-testid="book-phone" className={field} value={form.phone} onChange={set("phone")} type="tel" autoComplete="tel" maxLength={40} /></label>
        <label className="block">Email<input data-testid="book-email" className={field} value={form.email} onChange={set("email")} type="email" autoComplete="email" maxLength={200} /></label>
        <label className="block">Service address<input data-testid="book-address" className={field} value={form.address} onChange={set("address")} autoComplete="street-address" maxLength={300} /></label>
        <label className="block">Service{page.services.length ? " *" : ""}
          <select data-testid="book-service" className={field} value={form.service} onChange={set("service")}>
            <option value="">Choose a service</option>
            {page.services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">Preferred dates and times<input data-testid="book-preferred" className={field} value={form.preferred} onChange={set("preferred")} placeholder="e.g. Tue or Wed morning, next week" maxLength={300} /></label>
        <label className="block">Note<textarea data-testid="book-note" className={field} value={form.note} onChange={set("note")} rows={4} maxLength={2000} /></label>
        <label className="block">Photos (optional, up to {BOOKING_MAX_PHOTOS})<input data-testid="book-photos" className="mt-1 block" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addPhotos(e.target.files)} disabled={form.photos.length >= BOOKING_MAX_PHOTOS} /></label>
        {form.photos.length > 0 && (
          <p data-testid="book-photo-count">{form.photos.length} photo{form.photos.length === 1 ? "" : "s"} added <button type="button" data-testid="book-photos-clear" className="underline" onClick={() => setForm((f) => ({ ...f, photos: [] }))}>Remove</button></p>
        )}
        {/* Honeypot: hidden from people, bots fill it. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input data-testid="book-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
        </div>
        {error && <p role="alert" data-testid="book-error" className="text-red-700">{error}</p>}
        <button type="submit" data-testid="book-submit" disabled={sending} className="min-h-11 rounded bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{sending ? "Sending…" : "Send request"}</button>
      </form>
    </main>
  );
}
