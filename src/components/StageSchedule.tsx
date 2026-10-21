"use client";

import { useState } from "react";
import { depositRemainderStages, installmentStages, STAGE_KIND_LABEL, stagePlan, todayYmd, type PlanEvery, type Stage } from "@/lib/stages";

const STATE_LABEL = { paid: "Paid", due: "Due now", overdue: "Overdue", upcoming: "Upcoming" } as const;
const STATE_CLASS = { paid: "text-emerald-700", due: "font-semibold text-teal-700", overdue: "font-semibold text-red-600", upcoming: "text-slate-500" } as const;

/** Customer-facing payment schedule (also on the owner's preview/print). */
export function StageSchedule({ stages, total, balance, muted = "text-slate-600" }: { stages: Stage[]; total: number; balance: number; muted?: string }) {
  if (!stages.length) return null;
  const plan = stagePlan(total, balance, stages, todayYmd());
  return (
    <div className="print-keep mt-4 border-t border-slate-300 pt-3 text-sm" data-testid="stage-schedule">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Payment schedule</p>
      <table className="w-full">
        <tbody>
          {plan.rows.map((row) => (
            <tr key={row.id} data-testid="stage-row" data-state={row.state} className="border-t border-slate-200 first:border-0">
              <td className="py-1 pr-2">
                {row.label || STAGE_KIND_LABEL[row.kind]}
                <span className={`block text-xs ${muted}`}>{row.mode === "percent" && row.value ? `${row.value}% · ` : ""}{row.dueDate ? `due ${row.dueDate}` : "no due date"}</span>
              </td>
              <td className="py-1 pr-2 text-right">${row.amount.toFixed(2)}{row.paid > 0 && row.remaining > 0 && <span className={`block text-xs ${muted}`}>${row.paid.toFixed(2)} paid</span>}</td>
              <td className={`py-1 text-right text-xs ${STATE_CLASS[row.state]}`}>{STATE_LABEL[row.state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.current && plan.current.remaining > 0 && (
        <p className="mt-1 font-semibold" data-testid="stage-due-now">
          {plan.current.state === "upcoming" ? "Next payment" : "Due now"}: ${plan.current.remaining.toFixed(2)} ({plan.current.label || STAGE_KIND_LABEL[plan.current.kind]}{plan.current.dueDate ? `, ${plan.current.dueDate}` : ""})
        </p>
      )}
    </div>
  );
}

/** Owner editor for the stages. Shows each stage's amount and warns when they don't add up to the total. */
export function StageEditor({ stages, onChange, total, balance }: { stages: Stage[]; onChange: (stages: Stage[]) => void; total: number; balance: number }) {
  const plan = stagePlan(total, balance, stages, todayYmd());
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm";
  const update = (id: string, patch: Partial<Stage>) => onChange(stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)));
  function add() {
    const kind = stages.length === 0 ? "deposit" : "final";
    const next = stages.map((stage) => (stage.kind === "final" ? { ...stage, kind: "progress" as const } : stage));
    onChange([...next, { id: `${Date.now()}`, label: "", kind, mode: "percent", value: kind === "deposit" ? "30" : "", dueDate: "" }]);
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4" data-testid="stage-editor">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 font-medium">Payment stages (optional)</h2>
        <button type="button" className="tap min-h-11 shrink-0 whitespace-nowrap rounded-lg border border-teal-500/40 px-3 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 sm:min-h-10 dark:text-teal-300" onClick={add} data-testid="stage-add">Add stage</button>
      </div>
      <PlanMaker total={total} balance={balance} hasStages={stages.length > 0} onMake={onChange} />
      {stages.length === 0 && balance > 0.004 && (
        <button type="button" data-testid="stage-preset-deposit" onClick={() => onChange(depositRemainderStages(30, todayYmd()))} className="tap min-h-11 w-full rounded-lg border border-teal-500/40 px-3 text-left text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">
          Deposit now + remaining balance when done <span className="font-normal text-slate-500">(30% / 70%, edit below)</span>
        </button>
      )}
      {stages.length === 0 && <p className="text-xs text-slate-500">Split this invoice into deposit / progress / final payments with due dates. The invoice total does not change.</p>}
      {plan.rows.map((row) => (
        <div key={row.id} className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-5" data-testid="stage-edit-row">
          <label className="text-xs text-slate-600">Stage<select aria-label="Stage type" className={field} value={row.kind} onChange={(event) => update(row.id, { kind: event.target.value as Stage["kind"] })}>
            <option value="deposit">Deposit</option><option value="progress">Progress</option><option value="final">Final</option></select></label>
          <label className="text-xs text-slate-600">Name<input aria-label="Stage name" className={field} placeholder={STAGE_KIND_LABEL[row.kind]} value={row.label} onChange={(event) => update(row.id, { label: event.target.value })} /></label>
          <label className="text-xs text-slate-600">% or $<select aria-label="Stage mode" className={field} value={row.mode} onChange={(event) => update(row.id, { mode: event.target.value as Stage["mode"] })}>
            <option value="percent">% of total</option><option value="amount">$ amount</option></select></label>
          <label className="text-xs text-slate-600">{row.mode === "percent" ? "Percent" : "Amount"}<input aria-label="Stage value" inputMode="decimal" className={field} placeholder={row.kind === "final" ? "rest" : ""} value={row.value} onChange={(event) => update(row.id, { value: event.target.value })} /></label>
          <label className="text-xs text-slate-600">Due date<input aria-label="Stage due date" type="date" className={field} value={row.dueDate} onChange={(event) => update(row.id, { dueDate: event.target.value })} /></label>
          <p className="col-span-2 flex items-center justify-between text-xs text-slate-600 sm:col-span-5">
            <span data-testid="stage-edit-amount">${row.amount.toFixed(2)}{row.paid > 0 ? ` · $${row.paid.toFixed(2)} paid` : ""} · {row.state === "paid" ? "Paid" : row.state === "due" ? "Due now" : row.state === "overdue" ? "Overdue" : "Upcoming"}</span>
            <button type="button" className="tap min-h-11 rounded-lg border border-rose-500/40 px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 sm:min-h-10 dark:text-rose-300" onClick={() => onChange(stages.filter((stage) => stage.id !== row.id))}>Remove</button>
          </p>
        </div>
      ))}
      {stages.length > 0 && Math.abs(plan.mismatch) > 0.004 && (
        <p className="text-xs font-medium text-amber-700" data-testid="stage-mismatch">
          Stages add up to ${plan.planned.toFixed(2)}, invoice total is ${total.toFixed(2)} ({plan.mismatch > 0 ? `$${plan.mismatch.toFixed(2)} not scheduled` : `$${(-plan.mismatch).toFixed(2)} too much`}).
        </p>
      )}
    </div>
  );
}

/** Owner: "split what's owed into N payments" quick fill for the stages. Never records or sends anything. */
function PlanMaker({ total, balance, hasStages, onMake }: { total: number; balance: number; hasStages: boolean; onMake: (stages: Stage[]) => void }) {
  const [count, setCount] = useState("3");
  const [every, setEvery] = useState<PlanEvery>("month");
  const [first, setFirst] = useState(todayYmd());
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm";
  if (!(balance > 0.004)) return null;
  const n = Math.min(24, Math.max(2, Math.floor(Number(count)) || 2));
  function make() {
    if (hasStages && !window.confirm("Replace the current payment stages with this payment plan?")) return;
    onMake(installmentStages(total, balance, n, first, every));
  }
  return (
    <details className="rounded-lg border border-dashed border-teal-500/40 p-3 text-sm" data-testid="plan-maker">
      <summary className="cursor-pointer font-medium text-teal-700 dark:text-teal-300">Payment plan: split ${balance.toFixed(2)} owed into payments</summary>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-xs text-slate-600">Payments<input aria-label="Number of payments" data-testid="plan-count" inputMode="numeric" className={field} value={count} onChange={(event) => setCount(event.target.value)} /></label>
        <label className="text-xs text-slate-600">Every<select aria-label="How often" data-testid="plan-every" className={field} value={every} onChange={(event) => setEvery(event.target.value as PlanEvery)}><option value="week">Week</option><option value="2weeks">2 weeks</option><option value="month">Month</option></select></label>
        <label className="text-xs text-slate-600">First due<input aria-label="First payment due" data-testid="plan-first" type="date" className={field} value={first} onChange={(event) => setFirst(event.target.value)} /></label>
      </div>
      <p className="mt-2 text-xs text-slate-500">{n} payments of about ${(balance / n).toFixed(2)}. Customers see the schedule and what is due now on their link and portal, and pay by your manual methods (Zelle, Venmo, check…). You still record each payment yourself.</p>
      <button type="button" data-testid="plan-make" onClick={make} className="mt-2 min-h-11 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white">Make payment plan</button>
    </details>
  );
}
