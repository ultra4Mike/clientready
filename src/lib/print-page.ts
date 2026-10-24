/**
 * QA3: Print / Save PDF without freezing the page. window.print() blocks the main thread; calling it straight
 * from a click (while React is still committing, a focused input/editor is open, or after a double tap) could
 * leave the page unresponsive. This defers the print to after the next paint, blurs the focused field and
 * ignores a second tap while the print dialog is already opening.
 */
let printing = false;
export function printPage(win: Pick<Window, "print" | "setTimeout" | "requestAnimationFrame"> & { document?: Document } = window) {
  if (printing) return false;
  printing = true;
  try { (win.document?.activeElement as HTMLElement | null)?.blur?.(); } catch { /* ignore */ }
  const run = () => {
    win.setTimeout(() => {
      try { win.print(); } finally { printing = false; }
    }, 0);
  };
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(run); else run();
  return true;
}
export const _resetPrintForTests = () => { printing = false; };
