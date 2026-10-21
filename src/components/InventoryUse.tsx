"use client";

import { useEffect, useState } from "react";
import { adjust, inventory, type Part } from "@/lib/inventory";

export type StockUse = { id: string; partId: string; name: string; qty: number; cost: number };
type Fee = { id: string; name: string; amount: string };

/**
 * R88: owner takes parts from stock for this job. Stock goes down now; the cost is added to Job costs
 * as an "other fee" line (owner-only, not on the client's invoice). Undo puts both back.
 */
export default function InventoryUse({ used, onUsed, fees, onFees, locked }: { used: StockUse[]; onUsed: (list: StockUse[]) => void; fees: Fee[]; onFees: (fees: Fee[]) => void; locked: boolean }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("1");
  const [message, setMessage] = useState("");
  useEffect(() => { Promise.resolve().then(() => setParts(inventory.read())); void inventory.sync().then(setParts).catch(() => {}); }, []);
  if (!parts.length && !used.length) return null;

  function use() {
    const part = parts.find((item) => item.id === partId);
    const amount = Math.round((Number(qty) || 0) * 100) / 100;
    if (!part || amount <= 0) { setMessage("Pick a part and a quantity."); return; }
    setParts(inventory.upsert(adjust(part, -amount)));
    const cost = Math.round(amount * (Number(String(part.cost || "").replace(/[^0-9.-]/g, "")) || 0) * 100) / 100;
    const id = `stock-${Date.now()}`;
    onUsed([...used, { id, partId: part.id, name: part.name, qty: amount, cost }]);
    if (cost > 0) onFees([...fees, { id, name: `Stock: ${part.name} x${amount}`, amount: cost.toFixed(2) }]);
    setMessage(`Took ${amount} ${part.unit || ""} ${part.name} from stock. Save the invoice to keep the record.`.replace(/\s+/g, " "));
  }

  function undo(entry: StockUse) {
    const part = inventory.read().find((item) => item.id === entry.partId);
    if (part) setParts(inventory.upsert(adjust(part, entry.qty)));
    onUsed(used.filter((item) => item.id !== entry.id));
    onFees(fees.filter((fee) => fee.id !== entry.id));
    setMessage(`Put ${entry.qty} ${entry.name} back in stock.`);
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm sm:p-5" data-testid="inventory-use">
      <p className="font-semibold">Parts from stock</p>
      {!locked && parts.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">Part
            <select aria-label="Part from stock" data-testid="inventory-use-part" value={partId} onChange={(event) => setPartId(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-2">
              <option value="">Choose…</option>
              {parts.map((part) => <option key={part.id} value={part.id}>{part.name} ({part.qty} left)</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Qty
            <input aria-label="Quantity used" data-testid="inventory-use-qty" inputMode="decimal" value={qty} onChange={(event) => setQty(event.target.value)} className="min-h-11 w-20 rounded-lg border border-slate-300 px-2" />
          </label>
          <button type="button" data-testid="inventory-use-add" onClick={use} className="min-h-11 rounded-lg border border-slate-300 px-3 font-medium">Use</button>
        </div>
      )}
      {used.length > 0 && (
        <ul className="divide-y divide-slate-200" data-testid="inventory-used">
          {used.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 py-1.5" data-testid="inventory-used-row">
              <span>{entry.name} × {entry.qty}{entry.cost ? ` · $${entry.cost.toFixed(2)}` : ""}</span>
              {!locked && <button type="button" data-testid="inventory-use-undo" onClick={() => undo(entry)} className="min-h-11 rounded-lg px-2 text-xs underline">Undo</button>}
            </li>
          ))}
        </ul>
      )}
      {message && <p role="status" className="text-xs text-[var(--cr-muted)]">{message}</p>}
    </div>
  );
}
