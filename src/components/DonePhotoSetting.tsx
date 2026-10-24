"use client";

/** Owner setting: is a finished-job photo required before crew can mark a job done? Default: required. */
import { useEffect, useState } from "react";
import { loadDonePhotoOptional, saveDonePhotoOptional } from "@/lib/schedule";

export default function DonePhotoSetting() {
  const [optional, setOptional] = useState(false);
  const [ready, setReady] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => { let off = false; void loadDonePhotoOptional().then((r) => { if (!off) { setOptional(r.value); setReady(r.ready); } }); return () => { off = true; }; }, []);
  async function change(value: boolean) {
    setOptional(value);
    const error = await saveDonePhotoOptional(value);
    if (error) setOptional(!value);
    setMessage(error || (value ? "Saved. Crew can mark jobs done without a photo." : "Saved. Crew need a photo to mark jobs done."));
  }
  return (
    <section className="cr-section space-y-1 text-sm" data-testid="done-photo-setting">
      <label className="flex min-h-11 items-center gap-2 font-medium">
        <input type="checkbox" data-testid="done-photo-optional" checked={optional} disabled={!ready} onChange={(e) => change(e.target.checked)} />
        Let crew mark a job done without a finished-job photo
      </label>
      <p className="text-[var(--cr-muted)]">Off by default: a photo is required.{!ready ? " Needs the latest database update." : ""}</p>
      {message && <p role="status" data-testid="done-photo-message">{message}</p>}
    </section>
  );
}
