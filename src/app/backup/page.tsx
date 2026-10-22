"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { exportZip, stripLinks } from "@/lib/account-export";
import { OWNER_KEY } from "@/lib/doc-sync";
import { downloadBytes, isZip, readZipEntry } from "@/lib/zip";
import { applyRestore, planRestore } from "@/lib/backup-restore";
import { pushRestoreToCloud } from "@/lib/backup-cloud";

function read(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

/** R44: fails closed. Signed out = this device's own data (allowed); signed in, the crew check must succeed and say "not crew". */
async function ownerCheck() {
  const { data, error } = await supabase.auth.getUser();
  if (error && !/session/i.test(error.message || "")) return false;
  const user = data?.user;
  if (!user) return true;
  const { data: person, error: crewError } = await supabase.rpc("is_crew_email");
  if (crewError) return false;
  const row = Array.isArray(person) ? person[0] : person;
  return !(row && row.user_id && row.user_id !== user.id);
}


export default function BackupPage() {
  const [message, setMessage] = useState("");

  const [exporting, setExporting] = useState(false);
  // R34: owner only. Crew accounts never get the buttons (AppShell also sends them to /crew).
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => { ownerCheck().then(setOwner).catch(() => setOwner(false)); }, []);
  // Backlog 5: the whole account (cloud first, then this device's copy if offline) as a ZIP of CSVs + backup.json.
  async function downloadAccountZip() {
    if (!owner) return;
    setExporting(true);
    const fromCloud = await loadAccountIntoCache().catch(() => false);
    const bytes = exportZip({ ownerId: window.localStorage.getItem(OWNER_KEY) || undefined, profile: read("clientready-profile"), clients: read("clientready-clients") || [], documents: read("clientready-documents") || [], employees: read("clientready-employees") || [] });
    downloadBytes(`clientready-export-${new Date().toISOString().slice(0, 10)}.zip`, bytes);
    setMessage(fromCloud ? "Account export downloaded (from your account)." : "Export downloaded from this device (not signed in or offline).");
    setExporting(false);
  }

  function downloadBackup() {
    if (!owner) return;
    const backup = stripLinks({
      savedAt: new Date().toISOString(),
      ownerId: window.localStorage.getItem(OWNER_KEY) || undefined,
      profile: read("clientready-profile"),
      employees: read("clientready-employees"),
      clients: read("clientready-clients"),
      documents: read("clientready-documents"),
      appointments: read("clientready-appointments"),
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clientready-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded");
  }

  // Backup gaps: JSON or the account ZIP; shape + owner checked first; newer data on this device is kept
  // (merge) after a warning; employees restored; the result is written to the account.
  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = isZip(bytes) ? readZipEntry(bytes, "backup.json") : new TextDecoder().decode(bytes);
      if (text === null) { setMessage("That ZIP has no backup.json. Use the account export ZIP or a backup file."); return; }
      const kv = { get: (k: string) => window.localStorage.getItem(k), set: (k: string, v: string) => window.localStorage.setItem(k, v) };
      const { data } = await supabase.auth.getSession();
      const plan = planRestore(text, kv, data.session?.user?.id || window.localStorage.getItem(OWNER_KEY) || "");
      if (!plan.ok) { setMessage(plan.reason); return; }
      if (plan.newerLocal > 0 && !window.confirm(`${plan.newerLocal} item${plan.newerLocal === 1 ? " on this device is" : "s on this device are"} newer than the backup or not in it. Restore and keep them (merge)?`)) { setMessage("Restore cancelled. Nothing changed."); return; }
      const counts = applyRestore(kv, plan.backup, "merge");
      setMessage(`Restored ${counts.documents} documents, ${counts.clients} clients, ${counts.employees} team members. Saving to your account…`);
      const cloud = await pushRestoreToCloud(plan.backup as never).catch(() => ({ ok: false, failed: 1 }));
      setMessage(cloud.ok ? `Restored ${counts.documents} documents, ${counts.clients} clients, ${counts.employees} team members, and saved to your account.` : "Restored on this device. Some of it could not be saved to your account yet; it will retry when you are online.");
    } catch {
      setMessage("That file could not be restored. Nothing changed.");
    }
  }

  return (
    <AppShell title="Backup your data">

      <section className="max-w-2xl py-2 sm:py-4">
        <PageHeader title="Backup your data" subtitle="Download a copy of your profile, clients, documents, and appointments. Restore it if this browser is cleared." />

        <div className="mt-6 divide-y divide-teal-500/20 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] shadow-sm">
          <div className="space-y-3 p-5 sm:p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Download</h2>
          {owner === false && <p data-testid="backup-owner-only" className="rounded-lg border border-slate-300 bg-slate-500/5 px-3 py-2 text-sm text-[var(--cr-muted)]">Only the business owner can download or restore data.</p>}
          <button type="button" data-testid="account-export" disabled={exporting || !owner} onClick={downloadAccountZip} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-teal-500/60 px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-500/10 disabled:opacity-50 sm:w-auto dark:text-teal-300">
            {exporting ? "Preparing…" : "Download everything (ZIP of spreadsheets)"}
          </button>
          <p className="text-xs text-[var(--cr-muted)]">Clients, documents, line items, payments and employees from your account as CSV files, plus a full backup file. Opens in Excel, Google Sheets or Numbers.</p>
          <button
            type="button"
            onClick={downloadBackup}
            disabled={!owner}
            data-testid="backup-json"
            className="min-h-11 rounded-lg border border-teal-500/40 px-4 py-2.5 text-sm font-medium transition hover:bg-teal-500/10"
          >
            Download backup (this device, for Restore)
          </button>
          </div>
          <div className="space-y-3 p-5 sm:p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Restore</h2>

          <label className="block text-sm font-medium text-slate-600">
            Restore from a backup file
            <input
              type="file"
              accept="application/json,.json,application/zip,.zip"
              data-testid="restore-file"
              className="mt-2 block w-full rounded-lg border border-dashed border-teal-500/40 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-teal-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950!"
              onChange={(event) => restoreBackup(event.target.files?.[0])}
            />
          </label>

          {message && <p data-testid="backup-message" className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-slate-600">{message}</p>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}