"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { exportZip } from "@/lib/account-export";
import { downloadBytes } from "@/lib/zip";

function read(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export default function BackupPage() {
  const [message, setMessage] = useState("");

  const [exporting, setExporting] = useState(false);
  // Backlog 5: the whole account (cloud first, then this device's copy if offline) as a ZIP of CSVs + backup.json.
  async function downloadAccountZip() {
    setExporting(true);
    const fromCloud = await loadAccountIntoCache().catch(() => false);
    const bytes = exportZip({ profile: read("clientready-profile"), clients: read("clientready-clients") || [], documents: read("clientready-documents") || [], employees: read("clientready-employees") || [] });
    downloadBytes(`clientready-export-${new Date().toISOString().slice(0, 10)}.zip`, bytes);
    setMessage(fromCloud ? "Account export downloaded (from your account)." : "Export downloaded from this device (not signed in or offline).");
    setExporting(false);
  }

  function downloadBackup() {
    const backup = {
      savedAt: new Date().toISOString(),
      profile: read("clientready-profile"),
      clients: read("clientready-clients"),
      documents: read("clientready-documents"),
      appointments: read("clientready-appointments"),
    };
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

  function restoreBackup(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result || "{}"));
        if (backup.profile) {
          window.localStorage.setItem(
            "clientready-profile",
            JSON.stringify(backup.profile)
          );
        }
        if (backup.clients) {
          window.localStorage.setItem(
            "clientready-clients",
            JSON.stringify(backup.clients)
          );
        }
        if (backup.documents) {
          window.localStorage.setItem(
            "clientready-documents",
            JSON.stringify(backup.documents)
          );
        }
        if (backup.appointments) {
          window.localStorage.setItem(
            "clientready-appointments",
            JSON.stringify(backup.appointments)
          );
        }
        setMessage("Backup restored. Refresh the app.");
      } catch {
        setMessage("That file could not be restored.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <AppShell title="Backup your data">

      <section className="max-w-2xl py-2 sm:py-4">
        <PageHeader title="Backup your data" subtitle="Download a copy of your profile, clients, documents, and appointments. Restore it if this browser is cleared." />

        <div className="mt-6 divide-y divide-teal-500/20 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] shadow-sm">
          <div className="space-y-3 p-5 sm:p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Download</h2>
          <button type="button" data-testid="account-export" disabled={exporting} onClick={downloadAccountZip} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-teal-500/60 px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-500/10 disabled:opacity-50 sm:w-auto dark:text-teal-300">
            {exporting ? "Preparing…" : "Download everything (ZIP of spreadsheets)"}
          </button>
          <p className="text-xs text-[var(--cr-muted)]">Clients, documents, line items, payments and employees from your account as CSV files, plus a full backup file. Opens in Excel, Google Sheets or Numbers.</p>
          <button
            type="button"
            onClick={downloadBackup}
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
              accept="application/json"
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