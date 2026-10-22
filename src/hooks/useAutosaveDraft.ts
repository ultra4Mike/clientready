"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, draftKey, getDraft, putDraft, type Draft } from "@/lib/drafts";

/**
 * Never lose typed work. Saves `value` as a draft (debounced, and at once when the page is hidden/closed),
 * offers a found draft back once (restorable), and clears it after a real save (clear()).
 * enabled=false while the record is still loading, so a load never overwrites or is saved as a draft.
 */
export function useAutosaveDraft<T>(form: string, recordId: string, value: T, { enabled = true, isEmpty, delay = 300 }: { enabled?: boolean; isEmpty?: (v: T) => boolean; delay?: number } = {}) {
  const key = draftKey(form, recordId);
  const [restorable, setRestorable] = useState<Draft<T> | null>(null);
  const [status, setStatus] = useState<"" | "saved-device">("");
  const baseline = useRef<string | null>(null); // the value as loaded: not a change, never a draft
  const checked = useRef("");
  const resolved = useRef(""); // key whose stored draft has been looked up
  const typed = useRef(false); // a non-empty change was drafted since the lookup
  const latest = useRef({ key, value, enabled });
  useEffect(() => { latest.current = { key, value, enabled }; });

  // Look for a draft once per record, after it has loaded.
  useEffect(() => {
    if (!enabled || checked.current === key) return;
    checked.current = key;
    baseline.current = JSON.stringify(value);
    let live = true;
    typed.current = false;
    getDraft<T>(key).then((draft) => { if (!live) return; resolved.current = key; if (draft && JSON.stringify(draft.value) !== baseline.current) setRestorable(draft); });
    return () => { live = false; };
  }, [enabled, key, value]);

  const write = useCallback(() => {
    const { key: k, value: v, enabled: on } = latest.current;
    const text = JSON.stringify(v);
    if (!on || checked.current !== k || resolved.current !== k) return;
    // Back to an empty form after typing (saved, or cleared on purpose): nothing left to lose.
    if (isEmpty && isEmpty(v)) { if (typed.current) { typed.current = false; void clearDraft(k); setStatus(""); } return; }
    if (text === baseline.current) return;
    typed.current = true;
    void putDraft(k, { value: v, updatedAt: new Date().toISOString() });
    setStatus("saved-device");
  }, [isEmpty]);

  // While a found draft is waiting for Restore/Discard, typing doesn't replace it.
  useEffect(() => {
    if (restorable) return;
    const timer = window.setTimeout(write, delay);
    return () => window.clearTimeout(timer);
  }, [value, write, delay, restorable]);

  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden" && !restorable) write(); };
    const hide = () => { if (!restorable) write(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", hide);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", hide); };
  }, [write, restorable]);

  return {
    restorable,
    status,
    /** Use the draft (caller fills the form), keep autosaving from there. */
    accept: () => { const d = restorable; setRestorable(null); return d?.value ?? null; },
    discard: () => { setRestorable(null); void clearDraft(key); },
    /** After a real save: the record now holds it; the new value is the baseline. */
    clear: (savedKey?: string) => { baseline.current = JSON.stringify(latest.current.value); setStatus(""); void clearDraft(key); if (savedKey && savedKey !== key) void clearDraft(savedKey); },
  };
}
