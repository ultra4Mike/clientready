"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  worker_name: string;
  job_date: string;
  invoice_number: string;
  hours: string;
  rate: string;
  pay: number;
  note: string;
};

export default function CrewPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      const { data: rows } = await supabase
        .from("crew_jobs")
        .select("*")
        .order("job_date", { ascending: false });
      const list = (rows || []) as Job[];
      setJobs(list);
      setName(list[0]?.worker_name || data.user.email || "");
    }
    load();
  }, []);

  const hours = jobs.reduce((sum, job) => sum + (Number(job.hours) || 0), 0);
  const pay = jobs.reduce((sum, job) => sum + (Number(job.pay) || 0), 0);

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] px-4 py-8 text-[var(--cr-text)]">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{name || "Your jobs"}</h1>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="text-sm"
          >
            Log out
          </button>
        </div>
        <p className="mt-2 text-sm text-[var(--cr-muted)]">Your hours and pay. Owner costs are not shown.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-teal-500/20 p-4">
            <p className="text-sm text-[var(--cr-muted)]">Hours</p>
            <p className="mt-1 text-2xl font-semibold">{hours.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-teal-500/20 p-4">
            <p className="text-sm text-[var(--cr-muted)]">Your pay</p>
            <p className="mt-1 text-2xl font-semibold">${pay.toFixed(2)}</p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {jobs.length === 0 && <p className="text-[var(--cr-muted)]">No jobs yet.</p>}
          {jobs.map((job) => (
            <div key={job.id} className="rounded-2xl border border-teal-500/20 p-4">
              <p className="font-medium">{job.invoice_number || "Job"}</p>
              <p className="text-sm text-[var(--cr-muted)]">
                {job.job_date || "No date"} · {job.hours || "0"} hrs · ${Number(job.rate || 0).toFixed(2)}/hr
              </p>
              <p className="mt-1 font-semibold">${Number(job.pay || 0).toFixed(2)}</p>
              {job.note && <p className="mt-1 text-sm text-[var(--cr-muted)]">{job.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}