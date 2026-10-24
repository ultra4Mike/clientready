"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Req = { id: string; name: string; phone: string; email: string; address: string; service: string; preferred: string; note: string; photos: string[]; created_at: string; client_id: string | null };

/** Dashboard in-app alert: new online booking requests (no email). Hidden until deploy26.sql runs or when empty. */
export default function BookingRequestsCard() {
  const [rows, setRows] = useState<Req[]>([]);

  useEffect(() => {
    supabase.from("booking_requests").select("id, name, phone, email, address, service, preferred, note, photos, created_at, client_id").eq("status", "new").order("created_at", { ascending: false }).limit(20)
      .then(({ data, error }) => { if (!error && Array.isArray(data)) setRows(data as Req[]); }, () => undefined);
  }, []);

  async function mark(id: string, status: "done" | "dismissed") {
    const { error } = await supabase.from("booking_requests").update({ status }).eq("id", id);
    if (!error) setRows((r) => r.filter((x) => x.id !== id));
  }

  if (!rows.length) return null;
  return (
    <section data-testid="booking-requests" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <h2 className="font-semibold">{rows.length} new booking request{rows.length === 1 ? "" : "s"}</h2>
      <ul className="mt-2 space-y-3">
        {rows.map((r) => (
          <li key={r.id} data-testid="booking-request-row" data-id={r.id}>
            <div className="font-medium">{r.name}{r.service ? ` · ${r.service}` : ""}</div>
            <div>{[r.phone, r.email, r.address].filter(Boolean).join(" · ")}</div>
            {r.preferred && <div>Preferred: {r.preferred}</div>}
            {r.note && <div className="whitespace-pre-wrap">{r.note}</div>}
            {r.photos?.length > 0 && <div>{r.photos.length} photo{r.photos.length === 1 ? "" : "s"}</div>}
            <div className="mt-1 flex flex-wrap gap-3">
              <a data-testid="booking-request-proposal" className="underline" href={r.client_id ? `/invoice?type=proposal&clientId=${encodeURIComponent(r.client_id)}` : "/invoice?type=proposal"}>Start a proposal</a>
              <button type="button" data-testid="booking-request-done" className="underline" onClick={() => mark(r.id, "done")}>Mark handled</button>
              <button type="button" data-testid="booking-request-dismiss" className="underline" onClick={() => mark(r.id, "dismissed")}>Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
