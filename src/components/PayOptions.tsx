"use client";

import { useState } from "react";
import { payOptions, type PaymentMethodsConfig } from "@/lib/payments/providers";

const BRAND: Record<string, { bg: string; mark: string }> = {
  venmo: { bg: "#008CFF", mark: "V" },
  cashapp: { bg: "#00C244", mark: "$" },
  paypal: { bg: "#003087", mark: "P" },
  zelle: { bg: "#6D1ED4", mark: "Z" },
  check: { bg: "#475569", mark: "✎" },
  bank: { bg: "#0f766e", mark: "🏦" },
};

/** "Ways to pay": one row per enabled method with Copy and, where the app has one, a deep link. Nothing is recorded. */
export default function PayOptions({ config, amount, reference, publicCopy = false, className = "", dueNote = "" }: { config: PaymentMethodsConfig; amount: number; reference: string; publicCopy?: boolean; className?: string; dueNote?: string }) {
  const [copied, setCopied] = useState("");
  const options = payOptions(config, { amount, reference }, publicCopy);
  if (!options.length) return null;
  function copy(id: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
  }
  return (
    <div className={`print-keep mt-4 rounded-2xl border border-slate-200 p-4 text-sm sm:p-5 ${className}`} data-testid="pay-options">
      <p className="text-base font-semibold">Ways to pay</p>
      {dueNote && <p className="mt-1 text-sm font-semibold text-teal-800" data-testid="pay-options-due">{dueNote}</p>}
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {options.map((option) => {
          const brand = BRAND[option.id] || { bg: "#0d9488", mark: option.label.slice(0, 1) };
          return (
            <li key={option.id} data-testid={`pay-option-${option.id}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 shadow-sm">
              <span className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white! shadow-sm print:border print:border-slate-400" style={{ backgroundColor: brand.bg }}>{brand.mark}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block whitespace-pre-line break-words text-slate-600">{option.detail}</span>
                </span>
              </span>
              <span className="print-hide grid grid-cols-2 gap-2">
                {option.href && <a href={option.href} target="_blank" rel="noreferrer" data-testid={`pay-link-${option.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 font-semibold text-white! shadow-sm transition hover:opacity-90" style={{ backgroundColor: brand.bg }}>{option.hrefLabel || "Open"}</a>}
                <button type="button" data-testid={`pay-copy-${option.id}`} onClick={() => copy(option.id, option.copy)} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 font-medium transition ${option.href ? "" : "col-span-2"} ${copied === option.id ? "cr-tone-good border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 hover:border-teal-500"}`}><span aria-hidden="true">{copied === option.id ? "✓" : "⧉"}</span>{copied === option.id ? "Copied" : "Copy"}</button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">After you pay, the business marks the invoice paid.</p>
    </div>
  );
}
