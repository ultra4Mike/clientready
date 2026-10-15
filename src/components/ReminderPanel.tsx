"use client";

import { useState } from "react";
import { mailtoHref, reminderSubject, reminderText, smsHref, type ReminderInput, type ReminderTone } from "@/lib/reminders";

const TONES: [ReminderTone, string][] = [["friendly", "Friendly"], ["firm", "Firm"], ["final", "Final"]];

/** Builds a reminder to copy or open in the phone's text/email app. Never sends anything itself. */
export default function ReminderPanel({ input, phone, email, onClose }: { input: ReminderInput; phone: string; email: string; onClose?: () => void }) {
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
        <button type="button" onClick={copy} data-testid="reminder-copy" className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950! transition hover:bg-teal-400">{copied ? "Copied" : "Copy text"}</button>
        {phone ? <a className={button} data-testid="reminder-sms" href={smsHref(phone, text)}>Open in Messages</a> : <span className={`${button} opacity-50`}>No phone on file</span>}
        {email ? <a className={button} data-testid="reminder-email" href={mailtoHref(email, subject, text)}>Open in email</a> : <span className={`${button} opacity-50`}>No email on file</span>}
        {onClose && <button type="button" className="text-sm text-[var(--cr-muted)]" onClick={onClose}>Close</button>}
      </div>
      <p className="text-xs text-[var(--cr-muted)]">Nothing is sent automatically. You review and send it from your phone or email app.</p>
    </div>
  );
}
