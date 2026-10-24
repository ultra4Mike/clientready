"use client";

/** Owner: crew time-off requests (unpaid). Approve or deny; nothing here touches pay. */
import { useEffect, useState } from "react";
import { TIME_OFF_LABEL, timeOffDays, type TimeOffRequest } from "@/lib/crew-tools";
import { decideTimeOff, ownerTimeOff } from "@/lib/time-off";

export default function TimeOffRequests() {
  const [rows, setRows] = useState<TimeOffRequest[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const result = await ownerTimeOff();
    setRows(result.rows);
    setMessage(result.error);
  }
  useEffect(() => { const t = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(t); }, []);

  async function decide(id: string, status: "approved" | "denied") {
    setBusy(id);
    const error = await decideTimeOff(id, status);
    setBusy("");
    setMessage(error ? `Could not save: ${error}` : status === "approved" ? "Approved (unpaid)." : "Denied.");
    void refresh();
  }

  const pending = rows.filter((row) => row.status === "pending");
  return (
    <section className="cr-section space-y-2 text-sm" data-testid="owner-time-off">
      <h2 className="text-base font-semibold">Time off requests {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs">{pending.length} waiting</span>}</h2>
      <p className="text-[var(--cr-muted)]">Unpaid time off your crew asked for in the crew app. No PTO setup needed.</p>
      {message && <p role="status" data-testid="owner-time-off-message">{message}</p>}
      {!rows.length && !message && <p className="text-[var(--cr-muted)]">No requests yet.</p>}
      <ul className="divide-y divide-teal-500/10">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="owner-time-off-row" data-status={row.status}>
            <span className="min-w-0">
              <span className="font-medium">{row.worker_name || row.worker_email}</span> · {row.start_date}{row.end_date && row.end_date !== row.start_date ? ` to ${row.end_date}` : ""} ({timeOffDays(row.start_date, row.end_date)} day(s))
              {row.note && <span className="block text-[var(--cr-muted)]">{row.note}</span>}
            </span>
            {row.status === "pending" ? (
              <span className="flex gap-2">
                <button type="button" disabled={busy === row.id} className="cr-btn cr-btn-primary min-h-11" data-testid="time-off-approve" onClick={() => decide(row.id, "approved")}>Approve</button>
                <button type="button" disabled={busy === row.id} className="cr-btn cr-btn-secondary min-h-11" data-testid="time-off-deny" onClick={() => decide(row.id, "denied")}>Deny</button>
              </span>
            ) : <span className="rounded-full border border-teal-500/30 px-2 py-0.5 text-xs">{row.status === "approved" ? "Approved (unpaid)" : TIME_OFF_LABEL[row.status]}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
