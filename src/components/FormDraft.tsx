"use client";

import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import RestoreDraftBanner from "@/components/RestoreDraftBanner";

/**
 * Never lose typed work, for simple forms: keeps `value` as a draft (not when it equals `blank`) and
 * shows "Restore unsaved changes?". After a successful save call clearDraft(form, id).
 */
export default function FormDraft<T>({ form, id = "", value, blank, onRestore, enabled = true, what }: { form: string; id?: string; value: T; blank: T; onRestore: (value: T) => void; enabled?: boolean; what?: string }) {
  const blankText = JSON.stringify(blank);
  const draft = useAutosaveDraft(form, id, value, { enabled, isEmpty: (v) => JSON.stringify(v) === blankText });
  return <RestoreDraftBanner what={what} status={draft.status} draft={draft.restorable} conflict={Boolean(draft.conflict)} onResolve={(choice) => { void draft.resolve(choice).then((theirs) => { if (theirs) onRestore(theirs as T); }); }} onRestore={() => { const v = draft.accept(); if (v) onRestore(v as T); }} onDiscard={draft.discard} />;
}
