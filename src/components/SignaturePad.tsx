"use client";

import { useRef, useState } from "react";
import { SIGNATURE_DISCLAIMER, scriptFont, signedAtLabel, type Signature } from "@/lib/signature";

const WIDTH = 400;
const HEIGHT = 120;

type Props = {
  value: Signature | null;
  onChange: (value: Signature | null) => void;
  defaultName?: string;
  /** R128 (customer page): the page already asks for the name once, so the pad doesn't ask again. */
  hideName?: boolean;
  /** R128: save as you draw/type (no separate Sign press needed before Approve). */
  autoCommit?: boolean;
};

/** Remount with a new `key` when a different document is opened or the form is cleared. */
export default function SignaturePad({ value, onChange, defaultName = "", hideName = false, autoCommit = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"drawn" | "typed">(value?.type || "drawn");
  const [signerName, setSignerName] = useState(value?.signerName || "");
  const [typed, setTyped] = useState(value?.text || "");
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState("");

  function context() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Ink is always saved black on a transparent background; CSS recolors it for dark mode.
    ctx.strokeStyle = "#000000";
    return ctx;
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = context();
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    const was = drawing.current;
    drawing.current = false;
    if (was && autoCommit && canvasRef.current) onChange({ type: "drawn", dataUrl: canvasRef.current.toDataURL("image/png"), signerName: (signerName.trim() || defaultName.trim()), signedAt: new Date().toISOString() });
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
    setHasInk(false);
  }

  function clearAll() {
    clearCanvas();
    setTyped("");
    setError("");
    onChange(null);
  }

  function sign() {
    const name = signerName.trim() || defaultName.trim();
    if (!name) return setError("Add the signer's name.");
    const signedAt = new Date().toISOString();
    if (mode === "drawn") {
      if (!hasInk || !canvasRef.current) return setError("Draw a signature first.");
      onChange({ type: "drawn", dataUrl: canvasRef.current.toDataURL("image/png"), signerName: name, signedAt });
    } else {
      if (!typed.trim()) return setError("Type the signature first.");
      onChange({ type: "typed", text: typed.trim(), signerName: name, signedAt });
    }
    setSignerName(name);
    setError("");
  }

  const tab = (active: boolean) => `min-h-11 rounded-lg px-4 text-sm font-semibold transition ${active ? "bg-teal-500 text-slate-950! shadow-sm" : "border border-slate-300 hover:border-teal-500"}`;

  return (
    <div className="cr-panel space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4" data-testid="signature-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Customer signature</h2>
        <div className="flex gap-2">
          <button type="button" className={tab(mode === "drawn")} onClick={() => setMode("drawn")}>Draw</button>
          <button type="button" className={tab(mode === "typed")} onClick={() => setMode("typed")}>Type</button>
        </div>
      </div>
      {!hideName && <input className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder={defaultName ? `Signer name (${defaultName})` : "Signer name"} value={signerName} onChange={(event) => setSignerName(event.target.value)} />}
      {mode === "drawn" ? (
        <div className="sig-pad-surface w-full rounded-lg border-2 border-dashed border-teal-500/50 bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          data-testid="signature-canvas"
          className="sig-ink block w-full"
          style={{ touchAction: "none", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        </div>
      ) : (
        <input
          className="sig-typed min-h-16 w-full rounded-lg border-2 border-dashed border-teal-500/50 px-3 py-2 text-3xl"
          style={{ fontFamily: scriptFont }}
          placeholder="Type signature"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            if (autoCommit) onChange(event.target.value.trim() ? { type: "typed", text: event.target.value.trim(), signerName: (signerName.trim() || defaultName.trim()), signedAt: new Date().toISOString() } : null);
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!autoCommit && <button type="button" onClick={sign} className="min-h-11 flex-1 rounded-lg sm:flex-none bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white! shadow-md transition hover:bg-teal-500 disabled:opacity-50">Sign</button>}
        <button type="button" onClick={clearAll} className="min-h-11 flex-1 rounded-lg sm:flex-none border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Clear</button>
        {value && <span className="cr-tone-good w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:w-auto">Signed by {value.signerName} · {signedAtLabel(value.signedAt)}</span>}
      </div>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">{SIGNATURE_DISCLAIMER}</p>
    </div>
  );
}

/** `onDark` is for previews that are dark even in light mode (the "Bold modern" style). */
export function SignatureBlock({ signature, label = "Customer signature", muted = "text-slate-600", onDark = false }: { signature: Signature | null; label?: string; muted?: string; onDark?: boolean }) {
  if (!signature) return null;
  return (
    <div className={`min-w-0 ${onDark ? "sig-on-dark" : ""}`} data-testid="signature-block">
      <p className={`text-sm ${muted}`}>{label}</p>
      {signature.type === "drawn" && signature.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signature.dataUrl} alt={`Signature of ${signature.signerName}`} className="sig-ink mt-1 h-12 w-auto" />
      ) : (
        <p className="sig-typed mt-1 text-3xl leading-tight" style={{ fontFamily: scriptFont }}>{signature.text}</p>
      )}
      <p className={`text-xs ${muted}`}>Signed by {signature.signerName} · {signedAtLabel(signature.signedAt)}</p>
      <p className={`sig-fine mt-0.5 text-[11px] leading-snug ${muted}`}>{SIGNATURE_DISCLAIMER}</p>
    </div>
  );
}
