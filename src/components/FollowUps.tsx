"use client";

import { useEffect, useState } from "react";
import { approvalUrl, readApproval } from "@/lib/approval";
import { followUpOpened, followUps, noteFollowUpOpened, skipSeasonal, type FollowUp } from "@/lib/followups";
import { mailtoHref, smsHref } from "@/lib/reminders";
import { contactMethodLabel, preferredContactFor } from "@/lib/contact-method";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };

/** Follow-ups to send yourself: tomorrow's appointment reminders, quotes waiting 3+ days, and seasonal reminders. Never sent automatically. */
export default function FollowUps({ docs, today, limit, testid = "followups" }: { docs: Doc[]; today: string; limit?: number; testid?: string }) {
  const [business, setBusiness] = useState("");
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [, setSkipped] = useState(0);
  useEffect(() => {
    Promise.resolve().then(() => {
      try { setBusiness(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").businessName || ""); } catch { setBusiness(""); }
    });
  }, []);
  if (!today) return null;
  const every = followUps(docs, today, business, (doc) => { const token = readApproval(doc.data?.approval)?.token; return token ? approvalUrl(token) : ""; });
  // Dashboard: the next `limit` not yet opened; each one you open drops off and the next one fills in. Today shows all.
  const waiting = limit ? every.filter((item) => !(opened[item.key] || followUpOpened(item.key))) : every;
  const items = limit ? waiting.slice(0, limit) : every;
  if (!items.length) return null;
  const mark = (item: FollowUp) => setOpened((current) => ({ ...current, [item.key]: noteFollowUpOpened(item.key) }));
  return (
    <section className="mt-6 space-y-3" data-testid={testid} data-total={waiting.length} data-shown={items.length}>
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">{limit ? "Reminders to send" : "Follow-ups"} <span className="text-sm font-normal text-[var(--cr-muted)]">You send these yourself.</span>{limit && waiting.length > items.length ? <a href="/calendar?view=day" data-testid={`${testid}-all`} className="text-sm font-medium text-teal-600 underline">See all {waiting.length} on Today</a> : null}</h2>
      {items.map((item) => {
        const when = opened[item.key] || followUpOpened(item.key);
        const source = docs.find((doc) => doc.id === item.docId);
        const prefer = preferredContactFor(source?.data?.clientId, item.clientName || source?.clientName);
        return (
          <div key={item.key} data-testid={`followup-${item.kind}`} data-doc-id={item.docId} data-opened={when ? "1" : "0"} className={`rounded-2xl border border-l-4 bg-[var(--cr-card)] p-4 text-sm shadow-sm transition sm:p-5 ${when ? "border-slate-500/20 border-l-slate-400 opacity-70" : item.kind === "appointment" ? "border-teal-500/20 border-l-sky-400" : item.kind === "seasonal" ? "border-teal-500/20 border-l-emerald-400" : "border-teal-500/20 border-l-amber-400"}`}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{item.kind === "appointment" ? <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" /> : <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2" />}</svg>{item.kind === "appointment" ? "Appointment reminder" : item.kind === "seasonal" ? "Seasonal reminder · same time last year" : `Quote waiting ${item.sinceDays} day${item.sinceDays === 1 ? "" : "s"}`} · {item.clientName || "Client"}{item.title ? ` · ${item.title}` : ""}</p>
            <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-500/5 px-3 py-2 leading-relaxed text-[var(--cr-muted)]" data-testid="followup-text">{item.body}</p>
            {prefer && <p className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-300" data-testid="followup-prefers" data-method={prefer}>Best by: {contactMethodLabel(prefer)}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {prefer === "call" && item.phone && <a href={`tel:${item.phone.replace(/[^0-9+]/g, "")}`} onClick={() => mark(item)} data-testid="followup-call" data-preferred="true" className="order-first inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-teal-500 px-4 font-semibold transition hover:bg-teal-500/10"><span aria-hidden="true">📞</span>Call</a>}
              {item.phone && <a href={smsHref(item.phone, item.body)} onClick={() => mark(item)} data-testid="followup-sms" data-preferred={prefer === "text" ? "true" : undefined} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400"><span aria-hidden="true">💬</span>Text</a>}
              {item.email && <a href={mailtoHref(item.email, item.subject, item.body)} onClick={() => mark(item)} data-testid="followup-email" data-preferred={prefer === "email" ? "true" : undefined} className={`${prefer === "email" ? "order-first " : ""}inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-teal-500/40 px-4 font-medium transition hover:border-teal-400`}><span aria-hidden="true">✉️</span>Email</a>}
              <button type="button" data-testid="followup-copy" onClick={() => { void navigator.clipboard?.writeText(item.body).catch(() => {}); setCopied(item.key); mark(item); }} className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 font-medium transition ${copied === item.key ? "cr-tone-good border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 hover:border-teal-500"}`}>{copied === item.key ? "Copied" : "Copy"}</button>
              <a href={`/invoice?id=${encodeURIComponent(item.docId)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">{item.kind === "seasonal" ? "Last year's job ›" : "Open ›"}</a>
              {item.kind === "seasonal" && <button type="button" data-testid="followup-skip-season" onClick={() => { skipSeasonal(item.key.split(":").slice(1, -1).join(":"), today.slice(0, 4)); setSkipped((n) => n + 1); }} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium text-[var(--cr-muted)] transition hover:bg-slate-500/10">Skip this year</button>}
            </div>
            {when && <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--cr-muted)]" data-testid="followup-opened"><span aria-hidden="true">✓</span>Opened {new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</p>}
          </div>
        );
      })}
    </section>
  );
}
