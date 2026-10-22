"use client";

import { useState } from "react";
import FormDraft from "@/components/FormDraft";
import type { ContactMethod } from "@/lib/contact-method";
import { mailtoHref, reminderSubject, reminderText, smsHref, type ReminderInput, type ReminderTone } from "@/lib/reminders";

const TONES: [ReminderTone, string][] = [["friendly", "Friendly"], ["firm", "Firm"], ["final", "Final"]];

/** Builds a reminder to copy or open in the phone's text/email app. Never sends anything itself. */
export default function ReminderPanel({ input, phone, email, prefer = "", onClose }: { input: ReminderInput; phone: string; email: string; prefer?: ContactMethod; onClose?: () => void }) {
  const [tone, setTone] = useState<ReminderTone>(input.dueDate && input.today && input.dueDate < input.today ? "firm" : "friendly");
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const text = edited[tone] ?? reminderText(tone, input);
  const subject = reminderSubject(tone, input);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const button = "rounded-lg border border-teal-500/30 px-3 py-2 text-center text-sm font-medium transition hover:border-teal-400";
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-teal-500/20 p-4" data-testid="reminder-panel">
      <FormDraft form="reminder" id={input.invoiceNumber} value={edited} blank={{}} onRestore={setEdited} what="reminder text" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Payment reminder</p>
        <div className="inline-flex rounded-lg border border-teal-500/30 p-0.5" role="tablist">
          {TONES.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tone === key} data-testid={`tone-${key}`} onClick={() => setTone(key)} className={`rounded-md px-3 py-1 text-sm ${tone === key ? "bg-teal-500 font-semibold text-slate-950!" : ""}`}>{label}</button>
          ))}
        </div>
      </div>
      <textarea aria-label="Reminder text" data-testid="reminder-text" className="min-h-32 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={text} onChange={(event) => setEdited((current) => ({ ...current, [tone]: event.target.value }))} />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button type="button" onClick={copy} data-testid="reminder-copy" className="min-h-11 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950! transition hover:bg-teal-400">{copied ? "Copied" : "Copy text"}</button>
        {prefer === "call" && phone && <a className={`${button} order-first border-teal-500 font-semibold`} data-testid="reminder-call" data-preferred="true" href={`tel:${phone.replace(/[^0-9+]/g, "")}`}>📞 Call (preferred)</a>}
        {phone ? <a className={`${button}${prefer === "text" ? " order-first border-teal-500 font-semibold" : ""}`} data-testid="reminder-sms" data-preferred={prefer === "text" ? "true" : undefined} href={smsHref(phone, text)}>Open in Messages{prefer === "text" && <span data-testid="contact-preferred"> (preferred)</span>}</a> : <span className={`${button} opacity-50`}>No phone on file</span>}
        {email ? <a className={`${button}${prefer === "email" ? " order-first border-teal-500 font-semibold" : ""}`} data-testid="reminder-email" data-preferred={prefer === "email" ? "true" : undefined} href={mailtoHref(email, subject, text)}>Open in email{prefer === "email" && <span data-testid="contact-preferred"> (preferred)</span>}</a> : <span className={`${button} opacity-50`}>No email on file</span>}
        {onClose && <button type="button" className="min-h-11 rounded-lg px-3 text-sm text-[var(--cr-muted)] transition hover:text-teal-500" onClick={onClose}>Close</button>}
      </div>
      <p className="text-xs text-[var(--cr-muted)]">Nothing is sent automatically. You review and send it from your phone or email app.</p>
    </div>
  );
}
