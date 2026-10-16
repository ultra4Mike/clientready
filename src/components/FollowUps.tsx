"use client";

import { useEffect, useState } from "react";
import { approvalUrl, readApproval } from "@/lib/approval";
import { followUpOpened, followUps, noteFollowUpOpened, type FollowUp } from "@/lib/followups";
import { mailtoHref, smsHref } from "@/lib/reminders";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };

/** Follow-ups to send yourself: tomorrow's appointment reminders and quotes waiting 3+ days for approval. Never sent automatically. */
export default function FollowUps({ docs, today }: { docs: Doc[]; today: string }) {
  const [business, setBusiness] = useState("");
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      try { setBusiness(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").businessName || ""); } catch { setBusiness(""); }
    });
  }, []);
  if (!today) return null;
  const items = followUps(docs, today, business, (doc) => { const token = readApproval(doc.data?.approval)?.token; return token ? approvalUrl(token) : ""; });
  if (!items.length) return null;
  const mark = (item: FollowUp) => setOpened((current) => ({ ...current, [item.key]: noteFollowUpOpened(item.key) }));
  return (
    <section className="mt-6 space-y-3" data-testid="followups">
      <h2 className="text-lg font-semibold">Follow-ups <span className="text-sm font-normal text-[var(--cr-muted)]">You send these yourself.</span></h2>
      {items.map((item) => {
        const when = opened[item.key] || followUpOpened(item.key);
        return (
          <div key={item.key} data-testid={`followup-${item.kind}`} data-doc-id={item.docId} data-opened={when ? "1" : "0"} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm shadow-sm">
            <p className="font-medium">{item.kind === "appointment" ? "Appointment reminder" : `Quote waiting ${item.sinceDays} days`} · {item.clientName || "Client"}{item.title ? ` · ${item.title}` : ""}</p>
            <p className="mt-1 whitespace-pre-line text-[var(--cr-muted)]" data-testid="followup-text">{item.body}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.phone && <a href={smsHref(item.phone, item.body)} onClick={() => mark(item)} data-testid="followup-sms" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 font-medium">Text</a>}
              {item.email && <a href={mailtoHref(item.email, item.subject, item.body)} onClick={() => mark(item)} data-testid="followup-email" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 font-medium">Email</a>}
              <button type="button" data-testid="followup-copy" onClick={() => { void navigator.clipboard?.writeText(item.body).catch(() => {}); setCopied(item.key); mark(item); }} className="min-h-11 rounded-lg border border-slate-300 px-3 font-medium">{copied === item.key ? "Copied" : "Copy"}</button>
              <a href={`/invoice?id=${encodeURIComponent(item.docId)}`} className="inline-flex min-h-11 items-center px-2 underline">Open</a>
            </div>
            {when && <p className="mt-1 text-xs text-[var(--cr-muted)]" data-testid="followup-opened">Opened {new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</p>}
          </div>
        );
      })}
    </section>
  );
}
