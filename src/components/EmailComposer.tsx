"use client";

import { useEffect, useMemo, useState } from "react";
import { approvalUrl } from "@/lib/approval";
import { activePortal, portalUrl } from "@/lib/portal";
import { mailtoHref } from "@/lib/reminders";
import { emailBody, emailSendingEnabled, emailSubject, logEmail, sendEmail, validEmail, type EmailKind, type EmailLogEntry } from "@/lib/email";

type Props = {
  docId: string;
  isProposal: boolean;
  status: string;
  clientName: string;
  clientEmail: string;
  clientId?: string;
  number: string;
  total: number;
  owed: number;
  dueDate: string;
  payUrl: string;
  businessName: string;
  ownerName: string;
  approvalToken?: string;
  contactName?: string;
  clientCompany?: string;
  log: EmailLogEntry[];
  onLogged: (log: EmailLogEntry[], markedSent: boolean) => void;
  onClose?: () => void;
};

const KIND_LABEL: Record<EmailKind, string> = { invoice: "Invoice", proposal: "Proposal", reminder: "Reminder" };

/**
 * Owner email with review: editable To / Subject / Message, a preview, and nothing goes out until the
 * owner clicks Send (or opens it in their own email app). Never sends on its own.
 */
export default function EmailComposer(props: Props) {
  const kinds: EmailKind[] = props.isProposal ? ["proposal"] : props.owed > 0.004 ? ["invoice", "reminder"] : ["invoice"];
  const [kind, setKind] = useState<EmailKind>(kinds[0]);
  const [to, setTo] = useState(props.clientEmail);
  const [subjects, setSubjects] = useState<Partial<Record<EmailKind, string>>>({});
  const [bodies, setBodies] = useState<Partial<Record<EmailKind, string>>>({});
  const [portal, setPortal] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [markSent, setMarkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { clientName, clientId, approvalToken } = props;

  useEffect(() => {
    let live = true;
    emailSendingEnabled().then((value) => live && setEnabled(value));
    if (!approvalToken && clientName.trim()) activePortal({ name: clientName, id: clientId || undefined }).then((token) => live && setPortal(token ? portalUrl(token) : ""));
    return () => {
      live = false;
    };
  }, [approvalToken, clientName, clientId]);

  const viewUrl = approvalToken ? approvalUrl(approvalToken) : portal;
  const input = useMemo(
    () => ({ kind, clientName: props.clientName, contactName: props.contactName, clientCompany: props.clientCompany, number: props.number, total: props.total, owed: props.owed, dueDate: props.dueDate, viewUrl, payUrl: props.payUrl, businessName: props.businessName, ownerName: props.ownerName, today: new Date().toISOString().slice(0, 10) }),
    [kind, props.clientName, props.contactName, props.clientCompany, props.number, props.total, props.owed, props.dueDate, viewUrl, props.payUrl, props.businessName, props.ownerName]
  );
  const subject = subjects[kind] ?? emailSubject(input);
  const body = bodies[kind] ?? emailBody(input);
  const ready = validEmail(to) && subject.trim() && body.trim();
  const canMarkSent = (props.status || "draft") === "draft" && kind !== "reminder";

  async function record(via: EmailLogEntry["via"], id = "") {
    const entry: EmailLogEntry = { sentAt: new Date().toISOString(), to: to.trim(), subject: subject.trim(), kind, via, ...(id ? { id } : {}) };
    const result = await logEmail(props.docId, entry, canMarkSent && markSent);
    if (result) props.onLogged(result.log, result.markedSent);
    return result;
  }

  async function send() {
    if (!ready || busy) return;
    setBusy(true);
    setMessage("");
    const result = await sendEmail(props.docId, to.trim(), subject.trim(), body);
    if (result.error) {
      setBusy(false);
      return setMessage(result.error);
    }
    const logged = await record("email", result.id);
    setBusy(false);
    setMessage(`Sent to ${to.trim()}.${logged?.markedSent ? " Marked as sent." : ""}`);
  }

  async function openedInApp() {
    const logged = await record("mailto");
    setMessage(`Opened in your email app. Send it from there.${logged?.markedSent ? " Marked as sent." : ""}`);
  }

  const field = "mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";
  const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/30 px-4 py-2 text-center sm:min-h-10 text-sm font-medium transition hover:border-teal-400";
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5" data-testid="email-composer" data-provider={enabled === null ? "checking" : enabled ? "app" : "mailto"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold">Email {props.clientName || "client"}</p>
        {kinds.length > 1 && (
          <div className="inline-flex rounded-lg border border-teal-500/30 p-0.5" role="tablist">
            {kinds.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={kind === key} data-testid={`email-kind-${key}`} onClick={() => setKind(key)} className={`min-h-9 rounded-md px-3 py-1 text-sm ${kind === key ? "bg-teal-500 font-semibold text-slate-950!" : ""}`}>{KIND_LABEL[key]}</button>
            ))}
          </div>
        )}
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">To
        <input aria-label="Email to" type="email" className={field} value={to} onChange={(event) => setTo(event.target.value)} placeholder="customer@example.com" />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Subject
        <input aria-label="Email subject" className={field} value={subject} onChange={(event) => setSubjects((current) => ({ ...current, [kind]: event.target.value }))} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Message
        <textarea aria-label="Email message" className={`${field} min-h-40`} value={body} onChange={(event) => setBodies((current) => ({ ...current, [kind]: event.target.value }))} />
      </label>
      {!viewUrl && <p className="text-xs text-[var(--cr-muted)]" data-testid="email-no-link">No online link yet. Share an approval link or the client portal to include one.</p>}
      <div className="rounded-lg border border-dashed border-teal-500/30 p-3 text-sm" data-testid="email-preview">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Preview</p>
        <p className="mt-1 text-xs opacity-80">To: {to.trim() || "—"}</p>
        <p className="text-xs opacity-80">Subject: {subject.trim() || "—"}</p>
        <p className="mt-2 whitespace-pre-wrap break-words">{body}</p>
      </div>
      {canMarkSent && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" data-testid="email-mark-sent" checked={markSent} onChange={(event) => setMarkSent(event.target.checked)} />
          Also mark this {props.isProposal ? "proposal" : "invoice"} as sent
        </label>
      )}
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {enabled && <button type="button" data-testid="email-send" disabled={!ready || busy} onClick={send} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-500 px-5 py-2 text-sm font-semibold sm:min-h-10 text-slate-950! transition hover:bg-teal-400 disabled:opacity-50">{busy ? "Sending…" : "Send email"}</button>}
        {ready ? (
          <a className={button} data-testid="email-mailto" href={mailtoHref(to, subject, body)} onClick={openedInApp}>Open in email app</a>
        ) : (
          <span className={`${button} opacity-50`}>Open in email app</span>
        )}
        {props.onClose && <button type="button" className="min-h-11 rounded-lg px-4 text-sm text-[var(--cr-muted)] transition hover:bg-teal-500/10 sm:min-h-10" onClick={props.onClose}>Close</button>}
      </div>
      {!ready && <p className="text-xs text-[var(--cr-muted)]">Add a valid email address, a subject and a message.</p>}
      {message && <p className="text-xs" data-testid="email-message" role="status">{message}</p>}
      <p className="text-xs text-[var(--cr-muted)]">Nothing is sent until you click {enabled ? "Send email" : "send in your email app"}.{enabled === false ? " (Sending from the app is not set up, so this opens your email app.)" : ""}</p>
      {props.log.length > 0 && (
        <div className="border-t border-teal-500/20 pt-2 text-xs" data-testid="email-log">
          <p className="font-semibold">Email history</p>
          <ul className="mt-1 space-y-0.5">
            {[...props.log].reverse().map((entry) => (
              <li key={`${entry.sentAt}-${entry.to}`}>{new Date(entry.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {entry.to} · {entry.subject} · {entry.via === "email" ? "sent from app" : "opened in email app"}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
