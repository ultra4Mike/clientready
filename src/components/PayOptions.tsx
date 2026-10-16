"use client";

import { useState } from "react";
import { payOptions, type PaymentMethodsConfig } from "@/lib/payments/providers";

/** "Ways to pay": one row per enabled method with Copy and, where the app has one, a deep link. Nothing is recorded. */
export default function PayOptions({ config, amount, reference, publicCopy = false, className = "" }: { config: PaymentMethodsConfig; amount: number; reference: string; publicCopy?: boolean; className?: string }) {
  const [copied, setCopied] = useState("");
  const options = payOptions(config, { amount, reference }, publicCopy);
  if (!options.length) return null;
  function copy(id: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
  }
  return (
    <div className={`print-keep mt-4 rounded-xl border border-slate-200 p-4 text-sm ${className}`} data-testid="pay-options">
      <p className="font-semibold">Ways to pay</p>
      <ul className="mt-2 space-y-2">
        {options.map((option) => (
          <li key={option.id} data-testid={`pay-option-${option.id}`} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 whitespace-pre-line"><span className="font-medium">{option.label}:</span> {option.detail}</span>
            <span className="print-hide flex gap-2">
              {option.href && <a href={option.href} target="_blank" rel="noreferrer" data-testid={`pay-link-${option.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-teal-500/40 px-3 font-medium">{option.hrefLabel || "Open"}</a>}
              <button type="button" data-testid={`pay-copy-${option.id}`} onClick={() => copy(option.id, option.copy)} className="min-h-11 rounded-lg border border-slate-300 px-3 font-medium">{copied === option.id ? "Copied" : "Copy"}</button>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">After you pay, the business marks the invoice paid.</p>
    </div>
  );
}
