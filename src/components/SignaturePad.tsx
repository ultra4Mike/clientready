"use client";

import { useRef, useState } from "react";
import { SIGNATURE_DISCLAIMER, scriptFont, signedAtLabel, type Signature } from "@/lib/signature";

const WIDTH = 400;
const HEIGHT = 120;

type Props = {
  value: Signature | null;
  onChange: (value: Signature | null) => void;
  defaultName?: string;
};

/** Remount with a new `key` when a different document is opened or the form is cleared. */
export default function SignaturePad({ value, onChange, defaultName = "" }: Props) {
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
    drawing.current = false;
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

  const tab = (active: boolean) => `rounded-lg px-3 py-1 text-sm ${active ? "bg-slate-900 text-white" : "border border-slate-300"}`;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4" data-testid="signature-pad">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Customer signature</h2>
        <div className="flex gap-2">
          <button type="button" className={tab(mode === "drawn")} onClick={() => setMode("drawn")}>Draw</button>
          <button type="button" className={tab(mode === "typed")} onClick={() => setMode("typed")}>Type</button>
        </div>
      </div>
      <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={defaultName ? `Signer name (${defaultName})` : "Signer name"} value={signerName} onChange={(event) => setSignerName(event.target.value)} />
      {mode === "drawn" ? (
        <div className="sig-pad-surface w-full max-w-[400px] rounded-lg border border-dashed border-slate-400">
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
          className="sig-typed w-full rounded-lg border border-slate-300 px-3 py-2 text-3xl"
          style={{ fontFamily: scriptFont }}
          placeholder="Type signature"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={sign} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Sign</button>
        <button type="button" onClick={clearAll} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Clear</button>
        {value && <span className="text-sm text-slate-600">Signed by {value.signerName} · {signedAtLabel(value.signedAt)}</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
