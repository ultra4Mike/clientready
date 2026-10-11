"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = { id: string; worker_name: string; kind: string; amount: string; note: string; receipt: string };

export default function CrewSpend({ docId }: { docId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!docId) return;
    supabase.from("crew_expenses").select("*").eq("doc_id", docId).then(({ data }) => setRows((data || []) as Row[]));
  }, [docId]);
  if (!rows.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-300/40 p-3 text-sm">
      <p className="font-medium">Crew reported spend</p>
      <p className="mt-1 text-xs text-[var(--cr-muted)]">Check the receipt before you change your fee. This does not change the invoice.</p>
      {rows.map((row) => (
        <div key={row.id} className="mt-2">
          <p>{row.worker_name} · {row.kind} · ${row.amount} · {row.note}</p>
          {row.receipt && <a href={row.receipt} target="_blank" className="text-xs underline">Open receipt</a>}
        </div>
      ))}
    </div>
  );
}