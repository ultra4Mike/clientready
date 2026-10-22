/**
 * Never lose typed work: one draft API. Help's storage layer (form_drafts + IndexedDB + offline queue)
 * plugs in with setDraftStore(); until then a localStorage adapter with the same interface is used.
 */
export type Draft<T = unknown> = { value: T; updatedAt: string; baseVersion?: string };
export interface DraftStore {
  getDraft<T = unknown>(key: string): Promise<Draft<T> | null>;
  putDraft<T = unknown>(key: string, draft: Draft<T>): Promise<void>;
  clearDraft(key: string): Promise<void>;
}

const PREFIX = "cr-draft:";
const MAX_AGE_DAYS = 30;

export function localDraftStore(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = typeof window !== "undefined" ? window.localStorage : null): DraftStore {
  return {
    async getDraft<T>(key: string) {
      try {
        const raw = storage?.getItem(PREFIX + key);
        if (!raw) return null;
        const draft = JSON.parse(raw) as Draft<T>;
        if (Date.now() - Date.parse(draft.updatedAt) > MAX_AGE_DAYS * 864e5) { storage?.removeItem(PREFIX + key); return null; }
        return draft;
      } catch { return null; }
    },
    async putDraft<T>(key: string, draft: Draft<T>) { try { storage?.setItem(PREFIX + key, JSON.stringify(draft)); } catch { /* storage full */ } },
    async clearDraft(key: string) { try { storage?.removeItem(PREFIX + key); } catch { /* ignore */ } },
  };
}

let store: DraftStore | null = null;
export function setDraftStore(next: DraftStore) { store = next; }
export function draftStore(): DraftStore { return (store ||= localDraftStore()); }
export const getDraft = <T,>(key: string) => draftStore().getDraft<T>(key);
export const putDraft = <T,>(key: string, draft: Draft<T>) => draftStore().putDraft<T>(key, draft);
export const clearDraft = (key: string) => draftStore().clearDraft(key);
export const draftKey = (form: string, recordId: string) => `${form}:${recordId || "new"}`;
