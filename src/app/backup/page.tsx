"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";

function read(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export default function BackupPage() {
  const [message, setMessage] = useState("");

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
    <AppShell title="Backup">

      <section className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Backup your data</h1>
        <p className="mt-2 text-slate-600">
          Download a copy of your profile, clients, documents, and appointments.
          Restore it if this browser is cleared.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <button
            type="button"
            onClick={downloadBackup}
            className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400 disabled:opacity-50"
          >
            Download backup
          </button>

          <label className="block text-sm font-medium text-slate-600">
            Restore from a backup file
            <input
              type="file"
              accept="application/json"
              className="mt-2 block w-full text-sm"
              onChange={(event) => restoreBackup(event.target.files?.[0])}
            />
          </label>

          {message && <p className="text-sm text-slate-600">{message}</p>}
        </div>
      </section>
    </AppShell>
  );
}