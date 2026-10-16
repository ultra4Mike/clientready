"use client";

import qrcode from "qrcode-generator";
import { useState } from "react";
import { safePayUrl } from "@/lib/pay-link";

const QUIET = 4; // modules of white margin required by the QR spec

/** "Scan to pay" QR. Always black on white (inline fills, so dark mode and print cannot recolor it). */
export default function PayQr({ url, size = 104 }: { url: string; size?: number }) {
  const safe = safePayUrl(url);
  if (!safe) return null;
  let path = "";
  let count = 0;
  try {
    const qr = qrcode(0, "M");
    qr.addData(safe);
    qr.make();
    count = qr.getModuleCount();
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
  } catch {
    return null;
  }
  const box = count + QUIET * 2;
  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left" data-testid="pay-qr">
      <div className="rounded-xl p-2 shadow-sm ring-1 ring-black/10" style={{ background: "#ffffff", flex: "none" }}>
      <svg
        role="img"
        aria-label={`QR code for ${safe}`}
        width={size}
        height={size}
        viewBox={`0 0 ${box} ${box}`}
        shapeRendering="crispEdges"
        style={{ background: "#ffffff", flex: "none" }}
      >
        <rect width={box} height={box} fill="#ffffff" />
        <path d={path} fill="#000000" />
      </svg>
      </div>
      <div className="min-w-0">
        <p className="font-semibold">Scan to pay</p>
        <p className="text-xs opacity-80">Point your phone camera at the code</p>
        <p className="qr-url break-all text-xs opacity-80">{safe}</p>
        <QrActions url={safe} />
      </div>
    </div>
  );
}

/** Copy link / Share beside the QR (screen only; the printed invoice shows just the code and link). Never sends anything itself. */
function QrActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  async function share() {
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try { await nav.share({ title: "Invoice", url }); return; } catch (error) { if ((error as Error)?.name === "AbortError") return; }
    }
    await copy();
  }
  const button = "inline-flex min-h-11 items-center rounded-lg border border-teal-500/40 px-3 text-sm font-medium transition hover:border-teal-400 hover:bg-teal-500/10";
  return (
    <div className="print-hide mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
      <button type="button" className={button} data-testid="pay-qr-copy" data-state={copied ? "copied" : "idle"} onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      <button type="button" className={button} data-testid="pay-qr-share" onClick={share}>Share</button>
    </div>
  );
}
