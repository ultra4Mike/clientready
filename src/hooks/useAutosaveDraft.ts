"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, getDraft, onDraftStatus, putDraft, resolveDraftConflict, type DraftStatus } from "@/lib/drafts";

export type FoundDraft<T> = { payload: T; updatedAt: string };
export type DraftConflict<T> = { server: T; version: number };

/**
 * Never lose typed work (on Help's drafts API: device first, cloud when signed in, queued offline).
 * Saves `value` debounced ~300ms (and on hide/close), offers a found draft back once, clears after Save.
 * enabled=false while the record is still loading, so a load is never drafted or overwritten.
 */
export function useAutosaveDraft<T>(form: string, recordId: string, value: T, { enabled = true, isEmpty, delay = 300, maxAgeHours = 0, isStale }: { enabled?: boolean; isEmpty?: (v: T) => boolean; delay?: number; maxAgeHours?: number; isStale?: (draft: FoundDraft<T>) => boolean } = {}) {
  const key = `${form}::${recordId}`;
  const [restorable, setRestorable] = useState<FoundDraft<T> | null>(null);
  const [status, setStatus] = useState<DraftStatus | "">("");
  const [conflict, setConflict] = useState<DraftConflict<T> | null>(null);
  const baseline = useRef<string | null>(null);
  const checked = useRef("");
  const resolved = useRef("");
  const typed = useRef(false);
  const latest = useRef({ key, value, enabled, recordId });
  useEffect(() => { latest.current = { key, value, enabled, recordId }; });

  useEffect(() => onDraftStatus((e) => {
    if (e.formKey !== form || e.recordId !== latest.current.recordId) return;
    setStatus(e.status);
    if (e.status === "conflict") setConflict({ server: e.server as T, version: e.serverVersion || 0 });
  }), [form]);

  useEffect(() => {
    if (!enabled || checked.current === key) return;
    checked.current = key;
    baseline.current = JSON.stringify(value);
    typed.current = false;
    // Stale only if the record changed. (A cleanup flag here was cleared by the very next render, since
    // `value` is a dependency; new docs re-render at once, so the draft was never armed or offered.)
    const live = () => checked.current === key;
    getDraft<T>(form, recordId).then((draft) => {
      if (!live()) return;
      resolved.current = key;
      // Too old to matter (e.g. a time fix from yesterday): drop it instead of asking.
      if (draft && maxAgeHours > 0 && Date.now() - new Date(draft.updatedAt).getTime() > maxAgeHours * 3600000) { void clearDraft(form, recordId); return; }
      // Help retest #3: a draft that no longer belongs here (already saved as a doc, too old for a new form) is dropped.
      if (draft && isStale && isStale(draft)) { void clearDraft(form, recordId); return; }
      if (draft && JSON.stringify(draft.payload) !== baseline.current && !(isEmpty && isEmpty(draft.payload))) setRestorable({ payload: draft.payload, updatedAt: draft.updatedAt });
    }).catch(() => { if (live()) resolved.current = key; });
  }, [enabled, key, value, form, recordId, isEmpty, maxAgeHours, isStale]);

  const write = useCallback(() => {
    const { key: k, value: v, enabled: on, recordId: id } = latest.current;
    if (!on || checked.current !== k || resolved.current !== k) return;
    // Back to an empty form after typing (saved, or cleared on purpose): nothing left to lose.
    if (isEmpty && isEmpty(v)) { if (typed.current) { typed.current = false; void clearDraft(form, id); setStatus(""); } return; }
    if (JSON.stringify(v) === baseline.current) return;
    typed.current = true;
    putDraft(form, id, v).catch(() => setStatus("")); // >512KB or storage error: the form itself is untouched
  }, [isEmpty, form]);

  useEffect(() => {
    if (restorable) return; // a found draft waits for Restore/Discard
    const timer = window.setTimeout(write, delay);
    return () => window.clearTimeout(timer);
  }, [value, write, delay, restorable]);

  useEffect(() => {
    if (restorable) return;
    const flush = () => { if (document.visibilityState === "hidden") write(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", write);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", write); };
  }, [write, restorable]);

  return {
    restorable, status, conflict,
    accept: () => { const d = restorable; setRestorable(null); return d?.payload ?? null; },
    discard: () => { setRestorable(null); void clearDraft(form, recordId); },
    /** Another device saved a newer draft: keep mine (overwrite) or take theirs (returned so the form can show it). */
    resolve: async (choice: "mine" | "theirs") => {
      const c = conflict; if (!c) return null;
      setConflict(null);
      await resolveDraftConflict(form, recordId, choice, { payload: choice === "mine" ? latest.current.value : c.server, version: c.version }).catch(() => undefined);
      return choice === "theirs" ? c.server : null;
    },
    /** After a real save: the record holds it now. savedRecordId = the id the record got (new docs). */
    clear: (savedRecordId?: string) => { baseline.current = JSON.stringify(latest.current.value); typed.current = false; setStatus(""); void clearDraft(form, recordId); if (savedRecordId !== undefined && savedRecordId !== recordId) void clearDraft(form, savedRecordId); },
  };
}
