"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draw on a job photo: pen, arrow, circle and text in red / yellow / white, with Undo and Clear.
 * Runs fully on the device (canvas). Save flattens the marks into a new JPEG that replaces the photo
 * (kept under ~200 KB like other photos). Nothing is uploaded or sent from here.
 */
type Tool = "pen" | "arrow" | "circle" | "text";
type Point = { x: number; y: number };
type Mark =
  | { tool: "pen"; color: string; points: Point[] }
  | { tool: "arrow" | "circle"; color: string; from: Point; to: Point }
  | { tool: "text"; color: string; at: Point; text: string };

const COLORS = [{ value: "#ef4444", label: "Red" }, { value: "#facc15", label: "Yellow" }, { value: "#ffffff", label: "White" }];
const MAX_BYTES = 200 * 1024;

function draw(ctx: CanvasRenderingContext2D, mark: Mark, scale: number) {
  const width = Math.max(3, Math.round(5 * scale));
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 2 * scale;
  if (mark.tool === "pen") {
    ctx.beginPath();
    mark.points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.stroke();
  } else if (mark.tool === "circle") {
    ctx.beginPath();
    const rx = Math.abs(mark.to.x - mark.from.x) / 2, ry = Math.abs(mark.to.y - mark.from.y) / 2;
    ctx.ellipse((mark.from.x + mark.to.x) / 2, (mark.from.y + mark.to.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mark.tool === "arrow") {
    const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x);
    const head = 18 * scale;
    ctx.beginPath();
    ctx.moveTo(mark.from.x, mark.from.y);
    ctx.lineTo(mark.to.x, mark.to.y);
    ctx.moveTo(mark.to.x, mark.to.y);
    ctx.lineTo(mark.to.x - head * Math.cos(angle - 0.45), mark.to.y - head * Math.sin(angle - 0.45));
    ctx.moveTo(mark.to.x, mark.to.y);
    ctx.lineTo(mark.to.x - head * Math.cos(angle + 0.45), mark.to.y - head * Math.sin(angle + 0.45));
    ctx.stroke();
  } else if (mark.tool === "text") {
    ctx.font = `bold ${Math.round(28 * scale)}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(mark.text, mark.at.x, mark.at.y);
  }
  ctx.shadowBlur = 0;
}

export default function PhotoAnnotator({ src, onSave, onCancel }: { src: string; onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0].value);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const img = new Image();
    img.onload = () => { image.current = img; setReady(true); };
    img.onerror = () => setError("This photo could not be opened for drawing.");
    img.src = src;
  }, [src]);

  useEffect(() => {
    const el = canvas.current, img = image.current;
    if (!el || !img || !ready) return;
    if (el.width !== img.naturalWidth) { el.width = img.naturalWidth; el.height = img.naturalHeight; }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const scale = Math.max(img.naturalWidth, img.naturalHeight) / 1024;
    for (const mark of draft ? [...marks, draft] : marks) draw(ctx, mark, Math.max(scale, 0.5));
  }, [marks, draft, ready]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const el = event.currentTarget, box = el.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * el.width, y: ((event.clientY - box.top) / box.height) * el.height };
  };
  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    const at = point(event);
    if (tool === "text") {
      const text = window.prompt("Text to add", "")?.trim().slice(0, 40);
      if (text) setMarks((list) => [...list, { tool: "text", color, at, text }]);
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraft(tool === "pen" ? { tool, color, points: [at] } : { tool, color, from: at, to: at });
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!draft) return;
    const at = point(event);
    setDraft(draft.tool === "pen" ? { ...draft, points: [...draft.points, at] } : draft.tool === "text" ? draft : { ...draft, to: at });
  }
  function up() {
    if (draft) setMarks((list) => [...list, draft]);
    setDraft(null);
  }
  function save() {
    const el = canvas.current;
    if (!el) return;
    let url = "";
    for (const quality of [0.75, 0.6, 0.5, 0.4]) {
      url = el.toDataURL("image/jpeg", quality);
      if (Math.round(((url.split(",")[1] || "").length * 3) / 4) <= MAX_BYTES) break;
    }
    onSave(url);
  }
  const chip = (active: boolean) => `min-h-11 rounded-lg border px-3 text-sm font-medium ${active ? "border-teal-500 bg-teal-500/15" : "border-slate-300"}`;
  return (
    <div role="dialog" aria-modal="true" aria-label="Draw on photo" data-testid="photo-annotator" className="fixed inset-0 z-[1000] flex flex-col bg-slate-950/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Drawing tools">
        {(["arrow", "circle", "pen", "text"] as Tool[]).map((value) => (
          <button key={value} type="button" data-testid={`annotate-tool-${value}`} aria-pressed={tool === value} onClick={() => setTool(value)} className={chip(tool === value)}>{value === "arrow" ? "Arrow" : value === "circle" ? "Circle" : value === "pen" ? "Pen" : "Text"}</button>
        ))}
        {COLORS.map((item) => (
          <button key={item.value} type="button" data-testid={`annotate-color-${item.label.toLowerCase()}`} aria-label={item.label} aria-pressed={color === item.value} onClick={() => setColor(item.value)} className={`h-11 w-11 rounded-full border-2 ${color === item.value ? "border-teal-400" : "border-white/30"}`} style={{ backgroundColor: item.value }} />
        ))}
        <button type="button" data-testid="annotate-undo" disabled={!marks.length} onClick={() => setMarks((list) => list.slice(0, -1))} className={chip(false)}>Undo</button>
        <button type="button" data-testid="annotate-clear" disabled={!marks.length} onClick={() => setMarks([])} className={chip(false)}>Clear</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        {error ? <p role="alert">{error}</p> : (
          <canvas ref={canvas} data-testid="annotate-canvas" data-marks={marks.length} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="max-h-full max-w-full touch-none rounded-lg" />
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" data-testid="annotate-cancel" onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-white/40 px-4 font-medium">Cancel</button>
        <button type="button" data-testid="annotate-save" disabled={!ready || !marks.length} onClick={save} className="min-h-11 flex-1 rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! disabled:opacity-50">Save drawing</button>
      </div>
      <p className="mt-1 text-center text-xs text-white/70">Saving replaces this photo with the marked-up copy.</p>
    </div>
  );
}
