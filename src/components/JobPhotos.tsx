"use client";

import { useState } from "react";
import { compressPhoto, dataUrlBytes, MAX_PHOTOS, type JobPhoto } from "@/lib/photos";

type EditorProps = { photos: JobPhoto[]; onChange: (photos: JobPhoto[]) => void; showOnCopy?: boolean; onShowOnCopyChange?: (value: boolean) => void };

export function JobPhotosEditor({ photos, onChange, showOnCopy = false, onShowOnCopyChange }: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const room = MAX_PHOTOS - photos.length;
    const files = Array.from(list).slice(0, Math.max(room, 0));
    const notes: string[] = [];
    if (list.length > room) notes.push(`Only ${MAX_PHOTOS} photos fit on an invoice; ${list.length - Math.max(room, 0)} skipped.`);
    setBusy(true);
    const added: JobPhoto[] = [];
    for (const file of files) {
      try {
        const dataUrl = await compressPhoto(file);
        added.push({ id: `${Date.now()}-${added.length}`, dataUrl, caption: "", addedAt: new Date().toISOString() });
      } catch (error) {
        notes.push(error instanceof Error ? error.message : `${file.name}: could not add this photo.`);
      }
    }
    setBusy(false);
    if (added.length) onChange([...photos, ...added]);
    setMessage(notes.join(" "));
  }

  const totalKb = Math.round(photos.reduce((sum, photo) => sum + dataUrlBytes(photo.dataUrl), 0) / 1024);
  const full = photos.length >= MAX_PHOTOS;
  const pick = "cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5" data-testid="photos-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Job photos ({photos.length}/{MAX_PHOTOS})</h2>
        {!full && (
          <div className="flex gap-2">
            <label className={pick}>
              Take photo
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            </label>
            <label className={pick}>
              Choose photos
              <input type="file" accept="image/*" multiple className="hidden" data-testid="photos-input" disabled={busy} onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            </label>
          </div>
        )}
      </div>
      {busy && <p className="text-sm text-slate-600">Shrinking photos…</p>}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.dataUrl} alt={photo.caption || "Job photo"} className="aspect-square w-full rounded-lg object-cover" />
              <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" maxLength={60} placeholder="Caption (optional)" value={photo.caption} onChange={(event) => onChange(photos.map((item) => item.id === photo.id ? { ...item, caption: event.target.value } : item))} />
              <button type="button" className="text-sm text-slate-600" onClick={() => onChange(photos.filter((item) => item.id !== photo.id))}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {photos.length > 0 && onShowOnCopyChange && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-teal-600" data-testid="photos-on-copy" checked={showOnCopy} onChange={(event) => onShowOnCopyChange(event.target.checked)} />
          Show photos on the customer copy (preview, print, approval link)
        </label>
      )}
      {photos.length > 0 && <p className="text-xs text-slate-500" data-testid="photos-size">Photos add about {totalKb} KB to this document.</p>}
      {message && <p className="text-sm text-red-600" data-testid="photos-message">{message}</p>}
    </div>
  );
}

/** Small thumbnail row for the customer copy. Click to enlarge on screen. */
export function JobPhotoStrip({ photos, muted = "text-slate-600" }: { photos: JobPhoto[]; muted?: string }) {
  const [open, setOpen] = useState<JobPhoto | null>(null);
  if (!photos.length) return null;
  return (
    <div className="print-keep mt-3" data-testid="photo-strip">
      <p className={`text-xs ${muted}`}>Job photos</p>
      <div className="mt-1 grid grid-cols-6 gap-2">
        {photos.map((photo) => (
          <figure key={photo.id} className="min-w-0">
            <button type="button" className="photo-thumb block w-full" onClick={() => setOpen(photo)} aria-label="Enlarge photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.dataUrl} alt={photo.caption || "Job photo"} className="aspect-square w-full rounded object-cover" />
            </button>
            {photo.caption && <figcaption className={`photo-caption truncate text-xs ${muted}`}>{photo.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {open && (
        <div className="print-hide fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.dataUrl} alt={open.caption || "Job photo"} className="max-h-[85vh] max-w-full rounded-lg" />
          {open.caption && <p className="absolute bottom-6 left-0 right-0 text-center text-white">{open.caption}</p>}
        </div>
      )}
    </div>
  );
}
