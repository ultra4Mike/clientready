"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";

type Draft = {
  id: string;
  worker_name: string;
  client_name: string;
  client_phone: string;
  client_address: string;
  work_done: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: string;
  parts_cost: string;
  parts_note: string;
  drive_hours: string;
  drive_minutes: string;
  notes: string;
  finished: boolean;
  collected_amount: string;
  collected_method: string;
  status: string;
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: rows } = await supabase.from("job_drafts").select("*").eq("owner_id", data.user.id).order("created_at", { ascending: false });
      setDrafts((rows || []) as Draft[]);
    }
    load();
  }, []);

  function openAsInvoice(draft: Draft) {
    window.localStorage.setItem("clientready-open-draft", JSON.stringify(draft));
    window.location.href = "/invoice";
  }

  return (
    <AppShell title="Crew drafts">
      <PageHeader title="Crew drafts" subtitle="Jobs the crew sent in. Open one, set the price, and save the invoice." />
      <div className="space-y-3">
        {drafts.length === 0 && <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-xl">🧰</span><p className="text-base font-semibold">No crew jobs yet.</p><p className="max-w-sm text-sm text-[var(--cr-muted)]">When your crew sends a job report from their phone, it shows up here ready to price.</p></div>}
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
            <p className="text-base font-semibold">{draft.client_name} · {draft.worker_name}</p>
            <p className="text-sm text-[var(--cr-muted)]">
              {draft.work_date || "No date"} · {draft.hours || "0"} hrs · {draft.status}
              {draft.finished ? " · finished" : ""}
            </p>
            <p className="mt-3 text-sm leading-6">{draft.work_done}</p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">
              Parts ${draft.parts_cost || "0"} · Collected ${draft.collected_amount || "0"} {draft.collected_method || ""}
            </p>
            <button type="button" onClick={() => openAsInvoice(draft)} className="mt-4 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 sm:w-auto">Open as invoice</button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}