"use client";

import { useEffect, useState } from "react";
import { getMyRating, submitRating, type RatingTarget } from "@/lib/ratings";

/** "How did we do?" 1–5 stars + optional comment on the customer's invoice link. The customer can change it. */
export default function RatingBox({ target }: { target: RatingTarget }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = target.portal ? `${target.portal.p}:${target.portal.d}` : target.token || "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    getMyRating(target).then((rating) => { if (live && rating) { setStars(rating.stars); setComment(rating.comment || ""); setSaved(true); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target identity follows key
  }, [key]);
  async function send() {
    if (!stars) return setError("Tap a star first.");
    setBusy(true);
    setError("");
    try {
      await submitRating(target, stars, comment);
      setSaved(true);
    } catch {
      setError("Couldn't save your rating. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="print-hide mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm sm:p-5" data-testid="rating-box">
      <p className="font-semibold">How did we do?</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} data-testid={`rating-star-${n}`} onClick={() => { setStars(n); setSaved(false); }} className={`min-h-11 min-w-11 text-2xl leading-none ${n <= stars ? "text-amber-500" : "text-slate-300"}`}>★</button>
        ))}
      </div>
      <label className="mt-2 block">Anything to add? (optional)
        <textarea name="ratingComment" maxLength={1000} rows={2} value={comment} onChange={(event) => { setComment(event.target.value); setSaved(false); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" data-testid="rating-send" disabled={busy} onClick={send} className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white disabled:opacity-60">{saved ? "Update rating" : "Send rating"}</button>
        {saved && <span data-testid="rating-saved" className="text-emerald-700">Thank you for your feedback!</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
