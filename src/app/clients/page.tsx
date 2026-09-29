"use client";

import { FormEvent, useEffect, useState } from "react";
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
        saveLocal([
          ...clients,
          { id: Date.now().toString(), ...form },
        ]);
        setMessage("Saved locally. Cloud save failed: " + (error?.message || ""));
        setForm(emptyClient);
        return;
      }
      saveLocal([fromRow(data as Record<string, string>), ...clients]);
      setMessage("Client saved to your account.");
      setForm(emptyClient);
      return;
    }

    saveLocal([...clients, { id: Date.now().toString(), ...form }]);
    setMessage("Saved on this computer. Log in to save to your account.");
    setForm(emptyClient);
  }

  function editClient(client: Client) {
    setEditingId(client.id);
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

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h1 className="text-xl font-semibold">
            {editingId ? "Edit client" : "Add a client"}
          </h1>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Company"
            value={form.company}
            onChange={(event) =>
              setForm({ ...form, company: event.target.value })
            }
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Address"
            value={form.address}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
          />
          <label className="text-sm text-slate-600">
            Next visit
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={form.nextVisit}
              onChange={(event) =>
                setForm({ ...form, nextVisit: event.target.value })
              }
            />
          </label>
          <label className="text-sm text-slate-600">
            Start time
            <input
              type="time"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={form.visitTime}
              onChange={(event) =>
                setForm({ ...form, visitTime: event.target.value })
              }
            />
          </label>
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              {editingId ? "Update client" : "Save client"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </form>

        <div className="space-y-3">
          {clients.length === 0 && (
            <p className="text-slate-600">No saved clients yet.</p>
          )}
          {clients.map((client) => (
            <div
              key={client.id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="font-medium">{client.name}</p>
              <p className="text-sm text-slate-600">{client.company}</p>
              <p className="text-sm text-slate-600">{client.email}</p>
              {client.nextVisit && (
                <p className="mt-2 text-sm font-medium">
                  Next visit: {client.nextVisit}
                </p>
              )}
              {client.visitTime && (
                <p className="text-sm text-slate-600">Time: {client.visitTime}</p>
              )}
              {client.notes && (
                <p className="mt-1 text-sm text-slate-600">{client.notes}</p>
              )}
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => editClient(client)}
                  className="text-sm font-medium"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeClient(client.id)}
                  className="text-sm text-slate-500"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}