"use client";

/** Crew: ask for unpaid time off and see the boss's answer. No PTO balances or pay shown. */
import { useEffect, useState, type FormEvent } from "react";
import { TIME_OFF_LABEL, timeOffDays, timeOffError, type TimeOffRequest } from "@/lib/crew-tools";
import { crewMyTimeOff, crewRequestTimeOff } from "@/lib/time-off";

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function CrewTimeOff() {
  const [rows, setRows] = useState<TimeOffRequest[]>([]);
  const [form, setForm] = useState({ start: "", end: "", note: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const result = await crewMyTimeOff();
    setRows(result.rows);
    if (result.error) setMessage(result.error);
  }
  useEffect(() => { const t = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(t); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = timeOffError(form, todayYmd());
    if (problem) return setMessage(problem);
    setBusy(true);
    const error = await crewRequestTimeOff(form.start, form.end || form.start, form.note.trim());
    setBusy(false);
    if (error) return setMessage(error);
    setForm({ start: "", end: "", note: "" });
    setMessage("Request sent to your boss.");
    void refresh();
  }

  return (
    <details className="cr-section text-sm" data-testid="crew-time-off">
      <summary className="cursor-pointer font-semibold">Request time off (unpaid)</summary>
      <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2" noValidate>
        <label className="block">First day<input type="date" required data-testid="time-off-start" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 py-2" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
        <label className="block">Last day<input type="date" data-testid="time-off-end" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 py-2" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
        <label className="col-span-2 block">Note (optional)<input data-testid="time-off-note" maxLength={500} className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 py-2" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <button type="submit" disabled={busy} data-testid="time-off-send" className="cr-btn cr-btn-primary col-span-2 min-h-11">{busy ? "Sending…" : "Send request"}</button>
      </form>
      {message && <p role="status" className="mt-2" data-testid="time-off-message">{message}</p>}
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-teal-500/10" data-testid="time-off-list">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 py-1.5" data-status={row.status}>
              <span>{row.start_date}{row.end_date && row.end_date !== row.start_date ? ` to ${row.end_date}` : ""} · {timeOffDays(row.start_date, row.end_date)} day(s)</span>
              <span className="rounded-full border border-teal-500/30 px-2 py-0.5 text-xs">{TIME_OFF_LABEL[row.status] || row.status}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
