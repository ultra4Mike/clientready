"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseServices, servicesFrom, slugify } from "@/lib/booking";

/** Profile: online booking on/off, the public link to copy, and the services customers can pick. */
export default function BookingSettings() {
  const [uid, setUid] = useState("");
  const [ready, setReady] = useState<"loading" | "ok" | "unavailable">("loading");
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [services, setServices] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id || "";
      if (!id) { setReady("unavailable"); return; }
      setUid(id);
      const { data: row, error } = await supabase.from("profiles").select("booking_enabled, booking_slug, booking_services, business_name").eq("id", id).maybeSingle();
      if (error) { setReady("unavailable"); return; } // before deploy26.sql runs
      const r = (row || {}) as { booking_enabled?: boolean; booking_slug?: string | null; booking_services?: unknown; business_name?: string };
      setEnabled(Boolean(r.booking_enabled));
      setSlug(r.booking_slug || slugify(r.business_name || ""));
      setServices(servicesFrom(r.booking_services).join("\n"));
      setReady("ok");
    })().catch(() => setReady("unavailable"));
  }, []);

  const key = slug || uid;
  const link = typeof window !== "undefined" && key ? `${window.location.origin}/book/${key}` : "";

  async function save(nextEnabled = enabled) {
    setBusy(true);
    setMessage("");
    const clean = slugify(slug);
    if (clean && clean.length < 3) { setMessage("The link name needs at least 3 letters or numbers."); setBusy(false); return; }
    const { error } = await supabase.from("profiles").update({ booking_enabled: nextEnabled, booking_slug: clean || null, booking_services: parseServices(services) }).eq("id", uid);
    if (error) setMessage(/unique|duplicate/i.test(error.message) ? "That link name is taken. Try another." : "Could not save. Try again.");
    else { setEnabled(nextEnabled); setSlug(clean); setMessage("Saved."); }
    setBusy(false);
  }

  if (ready === "loading") return null;
  return (
    <section className="mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6" data-testid="booking-settings" data-enabled={enabled ? "on" : "off"}>
      <h2 className="text-lg font-bold tracking-tight">Online booking</h2>
      {ready === "unavailable" ? (
        <p className="mt-2 text-sm text-[var(--cr-muted)]" data-testid="booking-unavailable">Online booking isn&apos;t available yet.</p>
      ) : (
        <>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" data-testid="booking-toggle" checked={enabled} disabled={busy} onChange={(e) => save(e.target.checked)} />
            Let customers request a job from a public page
          </label>
          <label className="mt-3 block text-sm">Link name
            <input data-testid="booking-slug" className="mt-1 block w-full min-h-11 rounded border border-slate-300 px-3" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={40} placeholder="your-business" />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <code data-testid="booking-link" className="break-all">{link}</code>
            <button type="button" data-testid="booking-copy" className="min-h-11 rounded border px-3" onClick={() => navigator.clipboard?.writeText(link).then(() => setMessage("Link copied."), () => setMessage("Copy failed; select the link and copy it."))}>Copy link</button>
          </div>
          <label className="mt-3 block text-sm">Services customers can choose (one per line)
            <textarea data-testid="booking-services" className="mt-1 block w-full rounded border border-slate-300 px-3 py-2" rows={4} value={services} onChange={(e) => setServices(e.target.value)} />
          </label>
          <button type="button" data-testid="booking-save" disabled={busy} onClick={() => save()} className="mt-3 min-h-11 rounded bg-teal-700 px-4 font-semibold text-white disabled:opacity-60">Save booking settings</button>
          {message && <p className="mt-2 text-sm" data-testid="booking-message">{message}</p>}
          <p className="mt-2 text-xs text-[var(--cr-muted)]">New requests show on your dashboard. No emails are sent.</p>
        </>
      )}
    </section>
  );
}
