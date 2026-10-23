"use client";
// Owner-only: doc numbers (INV-/PROP-/CO…) inside timesheet text become links to that exact document (by id, never by number).
// Never use this on crew screens: workers must not reach price pages.
import Link from "next/link";
import type { ReactNode } from "react";

export type DocRef = { docId: string; label?: string };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function docLinkMap(refs: DocRef[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of refs) { const l = (r.label || "").trim(); if (r.docId && l && !m.has(l)) m.set(l, r.docId); }
  return m;
}

export default function DocLinkText({ text, docs, testId = "daydetail-doc-link" }: { text: string; docs: Map<string, string>; testId?: string }) {
  const labels = [...docs.keys()].sort((a, b) => b.length - a.length);
  if (!labels.length || !text) return <>{text}</>;
  const re = new RegExp(`(${labels.map(esc).join("|")})`, "g");
  const out: ReactNode[] = [];
  let last = 0; let k = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const id = docs.get(m[0])!;
    out.push(<Link key={k++} href={`/invoice?id=${encodeURIComponent(id)}`} onClick={(e) => e.stopPropagation()} data-testid={testId} data-doc-id={id} className="cr-doc-link">{m[0]}</Link>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
