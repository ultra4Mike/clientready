"use client";

import { CLIENT_CSV_HEADER, clientsFromCsv } from "@/lib/client-csv";
import { csvText, downloadCsv } from "@/lib/csv";

import { CONTACT_METHODS, contactMethodLabel, readContactMethod, type ContactMethod } from "@/lib/contact-method";
import { clientFromRow, readCachedClients } from "@/lib/client-rows";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormDraft from "@/components/FormDraft";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import PortalShare from "@/components/PortalShare";
import { backfillClientIds, renamePortalClient } from "@/lib/portal";
import { noteClientSaved } from "@/lib/client-sync";

type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  nextVisit: string;
  visitTime: string;
  notes: string;
  preferences?: string;
  contactMethod?: ContactMethod;
  reviewOptOut?: boolean;
  autoEmailOptOut?: boolean;
  updated_at?: string; // cloud baseline for the contact retry queue (absent before migration 20261016000000)
};

const emptyClient = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
  nextVisit: "",
  visitTime: "",
  notes: "",
  preferences: "",
  contactMethod: "" as ContactMethod,
  reviewOptOut: false,
  autoEmailOptOut: false,
};

/** R32: its own update so a database without migration 20261021110000 still saves the rest. */
async function saveReviewOptOut(id: string, optOut: boolean | undefined, autoOptOut?: boolean) {
  if (!id) return;
  await supabase.from("clients").update({ review_opt_out: Boolean(optOut) }).eq("id", id);
  // R51 (migration 20261021160000): its own update for the same reason.
  await supabase.from("clients").update({ auto_email_opt_out: Boolean(autoOptOut) }).eq("id", id);
}

function fromRow(row: Record<string, string>) {
  return clientFromRow(row, readCachedClients());
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState(emptyClient);
  const [editingId, setEditingId] = useState("");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [portalFor, setPortalFor] = useState("");

  useEffect(() => {
    async function load() {
      const raw = window.localStorage.getItem("clientready-clients");
      if (raw) {
        const parsed = JSON.parse(raw) as Client[];
        setClients(parsed.map((client) => ({ ...emptyClient, ...client })));
      }

      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      setUserId(user.id);

      const { data: rows, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage("Cloud load failed: " + error.message);
        return;
      }
      if (!rows) return;
      const next = rows.map((row) => fromRow(row as Record<string, string>));
      setClients(next);
      window.localStorage.setItem("clientready-clients", JSON.stringify(next));
      // R106: /clients?edit=<id> (from a client's page) opens that client's edit form.
      const editId = new URLSearchParams(window.location.search).get("edit");
      const target = editId ? next.find((client) => client.id === editId) : null;
      if (target) editClient(target);
      // Once per account: tie older documents to these clients by id (unique name matches only).
      await backfillClientIds(next);
    }

    load();
  }, []);

  function saveLocal(next: Client[]) {
    setClients(next);
    window.localStorage.setItem("clientready-clients", JSON.stringify(next));
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.company} ${client.email} ${client.phone} ${client.address} ${client.notes}`
        .toLowerCase()
        .includes(query)
    );
  }, [clients, search]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { setMessage("Add the client's name before saving."); return; } // R107

    if (editingId) {
      const next = clients.map((client) =>
        client.id === editingId ? { ...client, ...form } : client
      );
      saveLocal(next);
      if (userId) {
        const fields = {
          name: form.name,
          company: form.company,
          email: form.email,
          phone: form.phone,
          address: form.address,
          next_visit: form.nextVisit || null,
          visit_time: form.visitTime,
          notes: form.notes,
          preferences: form.preferences,
          preferred_contact: form.contactMethod,
        };
        let { data: saved, error } = await supabase.from("clients").update(fields).eq("id", editingId).eq("user_id", userId).select("*");
        // Before migration 20261016060000 there is no preferences column: save the rest, keep preferences on this device.
        if (error && /preferences|preferred_contact/.test(error.message || "")) {
          const { preferences: _p, preferred_contact: _c, ...rest } = fields;
          void _p; void _c;
          ({ data: saved, error } = await supabase.from("clients").update(rest).eq("id", editingId).eq("user_id", userId).select("*"));
        }
        await saveReviewOptOut(editingId, form.reviewOptOut, form.autoEmailOptOut);
        // Carry the server's new updated_at into the cache (baseline for later queued contact changes).
        const savedAt = !error && Array.isArray(saved) ? (saved[0] as { updated_at?: unknown } | undefined)?.updated_at : undefined;
        if (typeof savedAt === "string" && savedAt) {
          saveLocal(next.map((client) => (client.id === editingId ? { ...client, updated_at: savedAt } : client)));
          noteClientSaved(userId, editingId);
        }
        const before = clients.find((client) => client.id === editingId);
        if (!error && before && before.name.trim() !== form.name.trim()) await renamePortalClient(editingId, form.name);
        setMessage(error ? "Updated locally. Cloud update failed." : "Client updated.");
      }
      setEditingId("");
      setForm(emptyClient);
      setShowForm(false);
      return;
    }

    if (userId) {
      const fields = {
        user_id: userId,
        name: form.name,
        company: form.company,
        email: form.email,
        phone: form.phone,
        address: form.address,
        next_visit: form.nextVisit || null,
        visit_time: form.visitTime,
        notes: form.notes,
        preferences: form.preferences,
        preferred_contact: form.contactMethod,
      };
      let { data, error } = await supabase.from("clients").insert(fields).select("*").single();
      if (error && /preferences|preferred_contact/.test(error.message || "")) {
        const { preferences: _p, preferred_contact: _c, ...rest } = fields;
        void _p; void _c;
        ({ data, error } = await supabase.from("clients").insert(rest).select("*").single());
        if (!error && data) data = { ...data, preferences: form.preferences, preferred_contact: form.contactMethod };
      }
      if (error || !data) {
        saveLocal([...clients, { id: Date.now().toString(), ...form }]);
        setMessage("Saved locally. Cloud save failed: " + (error?.message || ""));
        setForm(emptyClient);
        setShowForm(false);
        return;
      }
      await saveReviewOptOut(String((data as { id?: unknown }).id || ""), form.reviewOptOut, form.autoEmailOptOut);
      saveLocal([{ ...fromRow(data as Record<string, string>), reviewOptOut: form.reviewOptOut, autoEmailOptOut: form.autoEmailOptOut }, ...clients]);
      setMessage("Client saved to your account.");
      setForm(emptyClient);
      setShowForm(false);
      return;
    }

    saveLocal([...clients, { id: Date.now().toString(), ...form }]);
    setMessage("Saved on this computer. Log in to save to your account.");
    setForm(emptyClient);
    setShowForm(false);
  }

  /** R106: add clients from a CSV (Name required; names already saved are skipped). Owner confirms first. */
  async function importClients(file: File) {
    const { added, skipped, missingName } = clientsFromCsv(await file.text(), clients.map((c) => c.name || ""));
    if (missingName) { setMessage("That CSV has no Name column. Use Export CSV to see the format."); return; }
    if (!added.length) { setMessage(`Nothing to import (${skipped} row${skipped === 1 ? "" : "s"} skipped: no name or already saved).`); return; }
    if (!window.confirm(`Add ${added.length} client${added.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}?`)) return;
    const { data: auth } = await supabase.auth.getUser();
    let next = [...clients];
    for (const item of added) {
      const { data } = auth.user ? await supabase.from("clients").insert({ user_id: auth.user.id, ...item }).select("*").single() : { data: null };
      next = [data ? fromRow(data as Record<string, string>) : ({ id: `${Date.now()}-${next.length}`, ...emptyClient, ...item } as Client), ...next];
    }
    saveLocal(next);
    setMessage(`Imported ${added.length} client${added.length === 1 ? "" : "s"}${skipped ? `, ${skipped} skipped` : ""}.`);
  }

  function editClient(client: Client) {
    setEditingId(client.id);
    setShowForm(true);
    // R106: bring the edit form to the person you clicked.
    window.setTimeout(() => document.getElementById("client-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    setForm({
      name: client.name || "",
      company: client.company || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      nextVisit: client.nextVisit || "",
      visitTime: client.visitTime || "",
      notes: client.notes || "",
      preferences: client.preferences || "",
      contactMethod: readContactMethod(client.contactMethod),
      reviewOptOut: Boolean(client.reviewOptOut),
      autoEmailOptOut: Boolean(client.autoEmailOptOut),
    });
  }

  function cancelEdit() {
    setEditingId("");
    setForm(emptyClient);
    setShowForm(false);
  }

  async function removeClient(id: string) {
    const ok = window.confirm("Are you sure you want to delete this client?");
    if (!ok) return;
    saveLocal(clients.filter((client) => client.id !== id));
    if (userId) {
      await supabase.from("clients").delete().eq("id", id).eq("user_id", userId);
    }
    if (editingId === id) cancelEdit();
  }

  return (
    <AppShell title="Client list">
      <section className="py-2 sm:py-4">
        <PageHeader
          title="Client list"
          subtitle={`${clients.length} saved`}
          actions={<button
              type="button"
              onClick={() => {
                setShowForm((open) => !open);
                setEditingId("");
                setForm(emptyClient);
              }}
              className="min-h-11 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50"
            >
              {showForm ? "Hide form" : "Add new client"}
            </button>}
        />

        <div className="mb-3 flex flex-wrap gap-2" data-testid="clients-csv">
          <button type="button" data-testid="clients-export" onClick={() => downloadCsv("clients.csv", csvText(CLIENT_CSV_HEADER, clients.map((c) => [c.name || "", c.company || "", c.email || "", c.phone || "", c.address || "", c.notes || "", c.preferences || ""])))} className="inline-flex min-h-11 items-center rounded-lg border border-teal-500/50 px-4 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Export CSV</button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-500/50 px-4 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 focus-within:ring-2 focus-within:ring-teal-400 dark:text-teal-300">Import CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" data-testid="clients-import" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importClients(file); }} />
          </label>
        </div>
        <input
          className="mb-6 min-h-11 w-full rounded-xl border border-teal-500/30 bg-[var(--cr-card)] px-4 py-3 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          placeholder="Search name, company, email, phone, or address"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <FormDraft form="client" id={editingId} value={form} blank={emptyClient} onRestore={(v) => { setForm(v); setShowForm(true); }} what="client details" />
        {showForm && (
          <form
            id="client-form"
            onSubmit={handleSubmit}
            className="mb-8 max-w-2xl space-y-4 rounded-2xl border border-teal-500/30 bg-white p-4 shadow-md sm:p-6"
          >
            <h2 className="text-lg font-bold tracking-tight">{editingId ? "Edit client" : "Add a client"}</h2>
            <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600 sm:col-span-2">Contact & next visit</h2>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            <label className="block text-sm font-medium text-slate-600">
              Next visit
              <input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={form.nextVisit} onChange={(event) => setForm({ ...form, nextVisit: event.target.value })} />
            </label>
            <label className="block text-sm font-medium text-slate-600">
              Start time
              <input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={form.visitTime} onChange={(event) => setForm({ ...form, visitTime: event.target.value })} />
            </label>
            </div>
            <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            <label className="block text-sm font-medium text-slate-600">
              Preferred contact
              <select name="contactMethod" id="client-contact-method" data-testid="client-contact-method-input" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={form.contactMethod} onChange={(event) => setForm({ ...form, contactMethod: readContactMethod(event.target.value) })}>
                <option value="">No preference</option>
                {CONTACT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:border-teal-500 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-500/10">
              <input type="checkbox" data-testid="client-review-optout" className="h-5 w-5 accent-teal-600" checked={Boolean(form.reviewOptOut)} onChange={(event) => setForm({ ...form, reviewOptOut: event.target.checked })} />
              Don&apos;t ask this client for reviews
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:border-teal-500 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-500/10">
              <input type="checkbox" name="autoEmailOptOut" data-testid="client-auto-optout" className="h-5 w-5 accent-teal-600" checked={Boolean(form.autoEmailOptOut)} onChange={(event) => setForm({ ...form, autoEmailOptOut: event.target.checked })} />
              No automatic emails
            </label>
            <textarea name="preferences" aria-label="Client preferences" data-testid="client-preferences-input" className="min-h-16 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base sm:text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Preferences: text or call, gate code, pets, best times…" value={form.preferences} onChange={(event) => setForm({ ...form, preferences: event.target.value })} />
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button type="submit" className="min-h-11 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50">{editingId ? "Update client" : "Save client"}</button>
              <button type="button" onClick={cancelEdit} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Cancel</button>
            </div>
          </form>
        )}

        {message && <p role="status" className="cr-tone-teal mb-4 rounded-lg border border-teal-400/50 bg-teal-50 px-3 py-2 text-sm text-teal-900">{message}</p>}

        <div className="overflow-hidden rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] shadow-sm">
          <div className="hidden gap-4 border-b border-slate-200 bg-teal-500/5 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_9rem_minmax(0,1.2fr)_max-content]">
            <span>Client</span><span>Contact</span><span>Next visit</span><span>Notes</span><span className="text-right">Actions</span>
          </div>
          {clients.length === 0 && <EmptyState icon="👤" title="No saved clients yet." line="Add a client to reuse their details on invoices." />}
          {clients.length > 0 && visible.length === 0 && <p className="p-10 text-center text-sm text-slate-600">No clients match that search.</p>}
          {visible.map((client) => (
            <div key={client.id} className="grid gap-3 border-b border-slate-200 px-4 py-4 transition last:border-b-0 hover:bg-teal-500/5 md:items-center md:gap-4 md:px-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_9rem_minmax(0,1.2fr)_max-content]">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400/30 to-teal-600/20 text-sm font-bold uppercase tracking-wide text-teal-700 ring-1 ring-teal-500/25 dark:text-teal-200">{client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "?"}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold"><Link href={`/clients/${encodeURIComponent(client.id)}`} data-testid="client-open" className="hover:underline">{client.name}</Link></p>
                  {client.company && <p className="truncate text-sm text-slate-600">{client.company}</p>}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2 text-sm text-slate-600 md:block md:space-y-0.5">
                {client.phone && <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-teal-500/30 px-3 font-medium transition hover:border-teal-400 md:flex md:min-h-0 md:border-0 md:px-0 md:font-normal md:hover:text-teal-600"><span aria-hidden="true">📞</span><span className="truncate">{client.phone}</span></a>}
                {client.email && <a href={`mailto:${client.email}`} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-teal-500/30 px-3 font-medium transition hover:border-teal-400 md:flex md:min-h-0 md:border-0 md:px-0 md:font-normal md:hover:text-teal-600"><span aria-hidden="true">✉️</span><span className="truncate">{client.email}</span></a>}
                {client.address.trim()
                  ? <span data-testid="client-address" title={client.address.trim()} className="flex w-full min-w-0 items-center gap-1.5 md:w-auto"><span aria-hidden="true" className="shrink-0">📍</span><span className="truncate">{client.address.trim()}</span></span>
                  : <span data-testid="client-address" className="flex w-full min-w-0 items-center gap-1.5 text-slate-400 italic md:w-auto"><span aria-hidden="true" className="shrink-0 opacity-50">📍</span>No address</span>}
                {(client.phone.replace(/[^\d]/g, "") || client.address.trim()) && <span className="flex flex-wrap gap-2 md:mt-1">
                  {client.phone.replace(/[^\d]/g, "") && <a href={`sms:${client.phone.replace(/[^\d+]/g, "")}`} data-testid="client-text" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-teal-500/30 px-3 font-medium transition hover:border-teal-400"><span aria-hidden="true">💬</span>Text</a>}
                  {client.address.trim() && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address.trim())}`} target="_blank" rel="noopener noreferrer" data-testid="client-map" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-teal-500/30 px-3 font-medium transition hover:border-teal-400"><span aria-hidden="true">📍</span>Map</a>}
                </span>}
              </div>
              <div className="text-sm">
                {client.nextVisit ? <p className="font-medium"><span className="md:hidden">Next visit: </span>{client.nextVisit}</p> : <p className="hidden text-slate-500 md:block">—</p>}
                {client.visitTime && <p className="text-slate-600">{client.visitTime}</p>}
              </div>
              <div className="min-w-0 overflow-hidden break-words text-sm text-slate-600 max-md:border-t max-md:border-teal-500/10 max-md:pt-2" data-testid="client-notes"><p className="line-clamp-2">{client.notes}</p>{client.contactMethod && <p className="mt-1" data-testid="client-contact-method" data-method={client.contactMethod}><span className="font-semibold text-teal-700 dark:text-teal-300">{CONTACT_METHODS.find((item) => item.value === client.contactMethod)?.icon} Best by:</span> {contactMethodLabel(client.contactMethod)}</p>}{client.preferences && <p className="mt-1 line-clamp-2" data-testid="client-preferences"><span className="font-semibold text-teal-700 dark:text-teal-300">⭐ Prefers:</span> {client.preferences}</p>}</div>
              <div className="grid min-w-0 grid-cols-3 gap-2 md:flex md:flex-wrap md:justify-end md:self-start" data-testid="client-actions">
                <button type="button" aria-expanded={portalFor === client.id} data-testid="client-portal-toggle" onClick={() => setPortalFor(portalFor === client.id ? "" : client.id)} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition sm:min-h-0 ${portalFor === client.id ? "border-teal-400 bg-teal-500/15 text-teal-700 dark:text-teal-300" : "border-slate-300 hover:border-teal-500"}`}><span aria-hidden="true">🔗</span>Portal</button>
                <button type="button" onClick={() => editClient(client)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium transition hover:border-teal-500 sm:min-h-10">Edit</button>
                <button type="button" onClick={() => removeClient(client.id)} className="min-h-11 rounded-lg border border-rose-500/40 px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 sm:min-h-10 dark:text-rose-300">Remove</button>
              </div>
              {portalFor === client.id && (
                <div className="md:col-span-5" data-testid="client-portal">
                  <PortalShare clientName={client.name} clientId={client.id} compact />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}