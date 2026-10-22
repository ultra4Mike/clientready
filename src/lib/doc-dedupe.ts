/**
 * R117: the same document can sit in the list twice, once as a device copy and once as the cloud copy
 * (different ids, same number). Only exact copies are merged: same type, same number, same client and
 * same total. Two different jobs that happen to share a number are both kept. The newest copy wins.
 */
import { docAmounts } from "./doc-stage";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };

const stamp = (doc: Doc) => Date.parse(String(doc.data?.updatedAt || doc.createdAt || "")) || 0;

export function dedupeCopies<T extends Doc>(docs: T[]): T[] {
  const byId = new Map<string, T>();
  for (const doc of docs) byId.set(doc.id, doc);
  const byKey = new Map<string, T>();
  const out: T[] = [];
  for (const doc of byId.values()) {
    const number = String(doc.data?.invoiceNumber || "").trim().toLowerCase();
    if (!number) { out.push(doc); continue; }
    const client = String(doc.clientName || (doc.data?.client as { name?: string } | undefined)?.name || "").trim().toLowerCase();
    const key = `${doc.type}|${number}|${client}|${docAmounts(doc as never).total.toFixed(2)}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, doc); out.push(doc); continue; }
    if (stamp(doc) > stamp(prev)) { out[out.indexOf(prev)] = doc; byKey.set(key, doc); }
  }
  return out;
}
