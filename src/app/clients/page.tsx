"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";

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
};

function fromRow(row: Record<string, string>) {
  return {
    id: row.id,
    name: row.name || "",
    company: row.company || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    nextVisit: row.next_visit || "",
    visitTime: row.visit_time || "",
    notes: row.notes || "",
  };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState(emptyClient);
  const [editingId, setEditingId] = useState("");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

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
    if (!form.name.trim()) return;

    if (editingId) {
      const next = clients.map((client) =>
        client.id === editingId ? { ...client, ...form } : client
      );
      saveLocal(next);
      if (userId) {
        const { error } = await supabase
          .from("clients")
          .update({
            name: form.name,
            company: form.company,
            email: form.email,
            phone: form.phone,
            address: form.address,
            next_visit: form.nextVisit || null,
            visit_time: form.visitTime,
            notes: form.notes,
          })
          .eq("id", editingId)
          .eq("user_id", userId);
        setMessage(error ? "Updated locally. Cloud update failed." : "Client updated.");
      }
      setEditingId("");
      setForm(emptyClient);
      setShowForm(false);
      return;
    }

    if (userId) {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          user_id: userId,
          name: form.name,
          company: form.company,
          email: form.email,
          phone: form.phone,
          address: form.address,
          next_visit: form.nextVisit || null,
          visit_time: form.visitTime,
          notes: form.notes,
        })
        .select("*")
        .single();
      if (error || !data) {
        saveLocal([...clients, { id: Date.now().toString(), ...form }]);
        setMessage("Saved locally. Cloud save failed: " + (error?.message || ""));
        setForm(emptyClient);
        setShowForm(false);
        return;
      }
      saveLocal([fromRow(data as Record<string, string>), ...clients]);
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

  function editClient(client: Client) {
    setEditingId(client.id);
    setShowForm(true);
    setForm({
      name: client.name || "",
      company: client.company || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      nextVisit: client.nextVisit || "",
      visitTime: client.visitTime || "",
      notes: client.notes || "",
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
    <AppShell title="Clients">
      <section className="mx-auto max-w-6xl py-2 sm:px-2 sm:py-4">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Client list</h1>
            <p className="mt-1 text-sm text-slate-600">{clients.length} saved</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm((open) => !open);
              setEditingId("");
              setForm(emptyClient);
            }}
            className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50"
          >
            {showForm ? "Hide form" : "Add new client"}
          </button>
        </div>

        <input
          className="mb-6 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          placeholder="Search name, company, email, or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <h2 className="text-lg font-bold tracking-tight">{editingId ? "Edit client" : "Add a client"}</h2>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Contact & next visit</h2>
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
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button type="submit" className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50">{editingId ? "Update client" : "Save client"}</button>
              <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Cancel</button>
            </div>
          </form>
        )}

        {message && <p className="mb-4 rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-slate-600">{message}</p>}

        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 md:col-span-2 xl:col-span-3">No saved clients yet.</p>}
          {clients.length > 0 && visible.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 md:col-span-2 xl:col-span-3">No clients match that search.</p>}
          {visible.map((client) => (
            <div key={client.id} className="flex h-full flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-5 pb-4 shadow-sm transition hover:border-teal-500/60">
              <p className="text-base font-semibold">{client.name}</p>
              <p className="text-sm text-slate-600">{client.company}</p>
              <p className="text-sm text-slate-600">{client.email}</p>
              {client.phone && <p className="text-sm text-slate-600">{client.phone}</p>}
              {client.nextVisit && <p className="mt-2 text-sm font-medium">Next visit: {client.nextVisit}</p>}
              {client.visitTime && <p className="text-sm text-slate-600">Time: {client.visitTime}</p>}
              {client.notes && <p className="mt-1 text-sm text-slate-600">{client.notes}</p>}
              <div className="mt-auto flex gap-2 border-t border-slate-200 pt-3">
                <button type="button" onClick={() => editClient(client)} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-teal-500">Edit</button>
                <button type="button" onClick={() => removeClient(client.id)} className="mt-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:bg-red-500/10 hover:text-red-600">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}