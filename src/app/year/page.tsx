"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { documentTotals } from "@/lib/discount";
import { uniqueDocs } from "@/lib/change-orders";
import { readPayments } from "@/lib/payments";
import { lineSplit } from "@/lib/line-split";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { supabase } from "@/lib/supabase";
import { searchWithNumbers } from "@/lib/doc-number";

type CrewExpense = { id: string; doc_id: string; worker_name?: string; kind?: string; amount?: string; note?: string; created_at?: string; receipt?: string };

type OtherFee = { id?: string; name?: string; amount?: string };

type JobCosts = {
  parts?: string;
  gas?: string;
  driveHours?: string;
  driveMinutes?: string;
  labor?: string;
  tools?: string;
  lunch?: string;
  otherFees?: OtherFee[];
  notes?: string;
};

type CrewRow = {
  id?: string;
  employeeId?: string;
  name?: string;
  rate?: string;
  hours?: string;
  workDate?: string;
  bonus?: string;
  note?: string;
};

type Employee = { id: string; name: string; kind?: "employee" | "contractor" };

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    paymentDate?: string;
    paymentAmount?: string;
    paymentMethod?: string;
    paymentRef?: string;
    taxPercent?: string;
    discountType?: string;
    discountValue?: string;
    items?: { qty?: string; rate?: string; category?: string }[];
    payments?: unknown;
    changeOrderOf?: { id?: string; number?: string };
    recurringFrom?: { id?: string; number?: string; period?: string };
    recurringReview?: string;
    jobCosts?: JobCosts;
    crew?: CrewRow[];
  };
};

type Row = {
  id: string;
  docId: string;
  docType: string;
  kind: "in" | "out" | "pay";
  date: string;
  client: string;
  number: string;
  category: string;
  amount: number;
  method: string;
  ref: string;
  note: string;
  hours?: string;
  rate?: string;
  worker?: string;
  workerKind?: string;
};

const costLabels: { key: keyof JobCosts; label: string }[] = [
  { key: "parts", label: "Parts and materials" },
  { key: "gas", label: "Gas / diesel" },
  { key: "labor", label: "Labor" },
  { key: "tools", label: "Job supplies" },
  { key: "lunch", label: "Lunch / meals cost" },
];

function money(value: unknown) {
  return Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
}

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => sum + money(item.qty) * money(item.rate), 0);
  return documentTotals(subtotal, doc.data?.taxPercent, doc.data?.discountType, doc.data?.discountValue).total;
}

function crewPay(row: CrewRow) {
  return money(row.hours) * money(row.rate) + money(row.bonus);
}

export default function YearPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [businessName, setBusinessName] = useState("Your business");
  const [taxId, setTaxId] = useState("");
  const [setAsidePercent, setSetAsidePercent] = useState(30);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [crewType, setCrewType] = useState("all");
  const [worker, setWorker] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [crewExpenses, setCrewExpenses] = useState<CrewExpense[]>([]);

  useEffect(() => {
    const profileRaw = window.localStorage.getItem("clientready-profile");
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      setBusinessName(profile.businessName || "Your business");
      setTaxId(profile.taxId || "");
      setSetAsidePercent(Number(profile.setAsidePercent) || 30);
    }
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(uniqueDocs(JSON.parse(raw)));
    const peopleRaw = window.localStorage.getItem("clientready-employees");
    if (peopleRaw) setEmployees(JSON.parse(peopleRaw));
    // Receipts crew members logged on their jobs (owner sees all of theirs; read-only here).
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      supabase.from("crew_expenses").select("id, doc_id, worker_name, kind, amount, note, created_at").then(({ data: rows, error }) => {
        if (!error && rows) setCrewExpenses(rows as CrewExpense[]);
      });
    });
  }, []);

  function kindFor(name: string, employeeId?: string) {
    const person = employees.find((item) => item.id === employeeId || item.name === name);
    return person?.kind || "employee";
  }

  const rows = useMemo(() => {
    const list: Row[] = [];
    documents.forEach((doc) => {
      const crew = doc.data?.crew || [];
      const hasCrew = crew.some((row) => crewPay(row) > 0);
      const tags = [
        doc.data?.changeOrderOf?.number ? `Change order for ${doc.data.changeOrderOf.number}` : "",
        doc.data?.recurringFrom ? `Recurring${doc.data.recurringFrom.period ? ` (${doc.data.recurringFrom.period})` : ""}` : "",
      ].filter(Boolean).join(" · ");
      if (doc.type === "invoice" && !isPendingRecurringDraft(doc)) {
        // Every payment and deposit recorded on the invoice counts once, in the year it was received.
        const payments = readPayments(doc.data).filter((payment) => money(payment.amount) > 0);
        payments.forEach((payment, index) => {
          const date = payment.date || doc.data?.invoiceDate || doc.createdAt || "";
          if (!String(date).startsWith(year) && !(!payment.date && String(doc.createdAt).includes(year))) return;
          list.push({
            id: `in-${doc.id}-${payment.id || index}`,
            docId: doc.id,
            docType: doc.type,
            kind: "in",
            date,
            client: doc.clientName || "No client",
            number: doc.data?.invoiceNumber || doc.title,
            category: "Gross receipts",
            amount: money(payment.amount),
            method: payment.method || "",
            ref: payment.ref || "",
            note: [payments.length > 1 ? `Payment ${index + 1} of ${payments.length}` : "", tags].filter(Boolean).join(" · "),
          });
        });
        // Older invoices marked paid without an amount: the whole total, as before.
        if (!payments.length && doc.data?.status === "paid") {
          const date = doc.data?.paymentDate || doc.data?.invoiceDate || doc.createdAt || "";
          if (String(date).includes(year) || String(doc.createdAt).includes(year)) {
            list.push({
              id: `in-${doc.id}`,
              docId: doc.id,
              docType: doc.type,
              kind: "in",
              date,
              client: doc.clientName || "No client",
              number: doc.data?.invoiceNumber || doc.title,
              category: "Gross receipts",
              amount: invoiceTotal(doc),
              method: doc.data?.paymentMethod || "",
              ref: doc.data?.paymentRef || "",
              note: tags,
            });
          }
        }
      }
      const costs = doc.data?.jobCosts;
      if (costs) {
        const date = doc.data?.invoiceDate || doc.createdAt || "";
        if (String(date).includes(year) || String(doc.createdAt).includes(year)) {
          costLabels.forEach((item) => {
            if (item.key === "labor" && hasCrew) return;
            const amount = money(costs[item.key]);
            if (!amount) return;
            list.push({
              id: `${doc.id}-${item.key}`,
              docId: doc.id,
              docType: doc.type,
              kind: "out",
              date,
              client: doc.clientName || "No client",
              number: doc.data?.invoiceNumber || doc.title,
              category: item.label,
              amount,
              method: "",
              ref: "",
              note: costs.notes || "",
            });
          });
          (costs.otherFees || []).forEach((fee, index) => {
            const amount = money(fee.amount);
            if (!amount) return;
            list.push({
              id: `${doc.id}-fee-${fee.id || index}`,
              docId: doc.id,
              docType: doc.type,
              kind: "out",
              date,
              client: doc.clientName || "No client",
              number: doc.data?.invoiceNumber || doc.title,
              category: "Other fees",
              amount,
              method: "",
              ref: "",
              note: fee.name || "Other fee",
            });
          });
        }
      }
      crew.forEach((row, index) => {
        const amount = crewPay(row);
        if (!amount) return;
        const date = row.workDate || doc.data?.invoiceDate || doc.createdAt || "";
        if (!String(date).includes(year) && !String(doc.createdAt).includes(year)) return;
        const name = row.name || "Worker";
        list.push({
          id: `${doc.id}-crew-${row.id || index}`,
          docId: doc.id,
          docType: doc.type,
          kind: "pay",
          date,
          client: doc.clientName || "No client",
          number: doc.data?.invoiceNumber || doc.title,
          category: "Labor",
          amount,
          method: "",
          ref: "",
          note: row.note || "",
          hours: row.hours || "",
          rate: row.rate || "",
          worker: name,
          workerKind: kindFor(name, row.employeeId),
        });
      });
    });
    return list;
  }, [documents, employees, year]);

  const inYear = (doc: SavedDocument) => String(doc.data?.invoiceDate || doc.createdAt || "").includes(year);
  const extras = useMemo(() => {
    const invoices = documents.filter((doc) => doc.type === "invoice" && !isPendingRecurringDraft(doc) && (doc.data?.status || "draft") !== "draft" && inYear(doc));
    const split = { labor: 0, materials: 0, other: 0, tagged: 0 };
    invoices.forEach((doc) => {
      const part = lineSplit(doc.data?.items || []);
      if (!part) return;
      split.tagged += 1;
      split.labor += part.labor;
      split.materials += part.materials;
      split.other += part.other;
    });
    const deposits = documents
      .filter((doc) => doc.type === "proposal" && inYear(doc))
      .flatMap((doc) => readPayments(doc.data).filter((payment) => money(payment.amount) > 0).map((payment) => ({ doc, payment })));
    const changeOrders = invoices.filter((doc) => doc.data?.changeOrderOf?.number);
    const recurring = invoices.filter((doc) => doc.data?.recurringFrom);
    const docById = new Map(documents.map((doc) => [doc.id, doc]));
    const receipts = crewExpenses
      .filter((item) => String(item.created_at || "").startsWith(year))
      .map((item) => ({ ...item, doc: docById.get(item.doc_id) }));
    return { split, deposits, changeOrders, recurring, receipts, receiptTotal: receipts.reduce((sum, item) => sum + money(item.amount), 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, crewExpenses, year]);

  const crewPeople = useMemo(() => {
    const names = Array.from(new Set(rows.filter((row) => row.worker).map((row) => row.worker as string)));
    return names
      .map((name) => ({ name, kind: rows.find((row) => row.worker === name)?.workerKind || "employee" }))
      .filter((person) => crewType === "all" || person.kind === crewType);
  }, [rows, crewType]);

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "in" && row.kind === "in") ||
        (filter === "out" && row.kind === "out") ||
        (filter === "employees" && row.kind === "pay") ||
        row.category === filter;
      const matchesType = filter !== "employees" || crewType === "all" || row.workerKind === crewType;
      const matchesWorker = filter !== "employees" || worker === "all" || row.worker === worker;
      return matchesFilter && matchesType && matchesWorker;
    });
    const docById = new Map(documents.map((doc) => [doc.id, doc]));
    // "1003", "INV-1003" or "PROP-1003" finds that document; other searches match the row text.
    const searched = searchWithNumbers(filtered, search, (row) => row.number, (row) => {
      const doc = docById.get(row.docId);
      const haystack = `${row.date} ${row.client} ${row.number} ${row.category} ${row.worker || ""} ${row.method} ${row.ref} ${row.note} ${row.docType} ${doc?.data?.status || ""}`.toLowerCase();
      return search.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
    });
    return searched.sort((a, b) => {
      if (sortBy === "client") return a.client.localeCompare(b.client);
      if (sortBy === "number") return a.number.localeCompare(b.number);
      if (sortBy === "amount") return b.amount - a.amount;
      if (sortBy === "method") return a.method.localeCompare(b.method);
      if (sortBy === "worker") return String(a.worker || "").localeCompare(String(b.worker || ""));
      return String(b.date).localeCompare(String(a.date));
    });
  }, [rows, documents, filter, crewType, worker, search, sortBy]);

  const summary = useMemo(() => {
    const collected = rows.filter((row) => row.kind === "in").reduce((sum, row) => sum + row.amount, 0);
    const spent = rows.filter((row) => row.kind === "out" || row.kind === "pay").reduce((sum, row) => sum + row.amount, 0);
    const wages = rows.filter((row) => row.kind === "pay").reduce((sum, row) => sum + row.amount, 0);
    const profit = collected - spent;
    const setAside = profit > 0 ? profit * (setAsidePercent / 100) : 0;
    return { collected, spent, wages, profit, setAside, yours: profit - setAside };
  }, [rows, setAsidePercent]);

  const workers = useMemo(() => {
    const names = Array.from(new Set(rows.filter((row) => row.worker).map((row) => row.worker as string)));
    return names.map((name) => {
      const jobs = rows.filter((row) => row.worker === name);
      return { name, total: jobs.reduce((sum, row) => sum + row.amount, 0), hours: jobs.reduce((sum, row) => sum + money(row.hours), 0) };
    });
  }, [rows]);

  function openRow(row: Row) {
    window.localStorage.setItem("clientready-open-document", row.docId);
    window.location.href = `/invoice?id=${encodeURIComponent(row.docId)}`;
  }

  return (
    <AppShell title="Year packet">
      <div className="mb-4 grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 sm:grid-cols-2 md:grid-cols-4 print:hidden">
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={year} onChange={(event) => setYear(event.target.value)} />
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Search client, invoice, worker" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={filter} onChange={(event) => { setFilter(event.target.value); setCrewType("all"); setWorker("all"); }}>
          <option value="all">All rows</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
          <option value="Parts and materials">Parts and materials</option>
          <option value="Gas / diesel">Gas / diesel</option>
          <option value="Job supplies">Job supplies</option>
          <option value="Lunch / meals cost">Lunch / meals cost</option>
          <option value="Other fees">Other fees</option>
          <option value="employees">Employees</option>
        </select>
        <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="date">Date</option>
          <option value="client">Client</option>
          <option value="number">Invoice</option>
          <option value="amount">Amount</option>
          <option value="method">Method</option>
          <option value="worker">Worker</option>
        </select>
      </div>

      {filter === "employees" && (
        <div className="mb-4 grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 md:grid-cols-2 print:hidden">
          <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={crewType} onChange={(event) => { setCrewType(event.target.value); setWorker("all"); }}>
            <option value="all">Employees and contractors</option>
            <option value="employee">Employees</option>
            <option value="contractor">Contractors</option>
          </select>
          <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={worker} onChange={(event) => setWorker(event.target.value)}>
            <option value="all">All names</option>
            {crewPeople.map((person) => <option key={person.name} value={person.name}>{person.name}</option>)}
          </select>
        </div>
      )}

      <button type="button" onClick={() => window.print()} className="mb-4 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 sm:w-auto print:hidden">Print / Save PDF</button>

      <div className="mb-6 space-y-2 print:hidden">
        {visible.length === 0 && <p className="rounded-xl border border-dashed border-teal-500/30 p-6 text-center text-sm text-[var(--cr-muted)]">No rows match that search.</p>}
        {visible.map((row) => (
          <button key={row.id} type="button" onClick={() => openRow(row)} className="block w-full rounded-xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-left shadow-sm transition hover:border-teal-400/60">
            <p className="font-medium">{row.worker ? `${row.worker} · ` : ""}{row.number} · {row.client}</p>
            <p className="text-sm text-[var(--cr-muted)]">
              {row.date} · {row.category} · ${row.amount.toFixed(2)}
              {row.hours ? ` · ${row.hours} hrs @ $${Number(row.rate || 0).toFixed(2)}` : ""} {row.method} {row.ref} {row.note}
            </p>
          </button>
        ))}
      </div>

      <div id="preview" className="w-full max-w-none rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales and expense log</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{businessName}</h1>
        <p className="text-sm text-slate-600">{year}{taxId ? ` · EIN ${taxId}` : ""}</p>
        <div className="mt-5 max-w-md divide-y divide-slate-200 border-y border-slate-200 text-sm">
          <div className="flex justify-between gap-4 py-2"><span className="text-slate-600">Collected</span><span className="tabular-nums">${summary.collected.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 py-2"><span className="text-slate-600">Expenses</span><span className="tabular-nums">${summary.spent.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 py-2"><span className="text-slate-600">Crew pay included</span><span className="tabular-nums">${summary.wages.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 py-2"><span className="text-slate-600">Profit</span><span className="tabular-nums">${summary.profit.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 py-2"><span className="text-slate-600">Set aside ({setAsidePercent}%)</span><span className="tabular-nums">${summary.setAside.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4 py-2 font-semibold"><span>Yours after set-aside</span><span className="tabular-nums">${summary.yours.toFixed(2)}</span></div>
        </div>

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Money in</h2>
        {rows.filter((row) => row.kind === "in").map((row) => (
          <div key={row.id} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-slate-200 py-2 text-sm last:border-b-0"><span className="w-24 tabular-nums text-slate-500">{row.date}</span><span className="flex-1">{row.client}</span><span>{row.number}</span><span className="text-slate-500">{row.method} {row.ref}</span><span className="w-24 text-right font-medium tabular-nums">${row.amount.toFixed(2)}</span></div>
        ))}

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Crew pay</h2>
        {workers.map((person) => (
          <div key={person.name} className="mt-4 w-full">
            <p className="font-medium">{person.name}: ${person.total.toFixed(2)} · {person.hours.toFixed(2)} hrs</p>
            {rows.filter((row) => row.worker === person.name).map((row) => (
              <div key={row.id} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-slate-200 py-2 text-sm last:border-b-0"><span className="w-24 tabular-nums text-slate-500">{row.date}</span><span className="flex-1">{row.number}{row.note ? <span className="text-slate-500"> {row.note}</span> : null}</span><span className="tabular-nums text-slate-500">{row.hours || "0"} hrs @ ${Number(row.rate || 0).toFixed(2)}/hr</span><span className="w-24 text-right font-medium tabular-nums">${row.amount.toFixed(2)}</span></div>
            ))}
          </div>
        ))}

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Other money out</h2>
        {["Parts and materials", "Gas / diesel", "Job supplies", "Lunch / meals cost", "Other fees"].map((label) => {
          const group = rows.filter((row) => row.category === label);
          const total = group.reduce((sum, row) => sum + row.amount, 0);
          if (!group.length) return null;
          return (
            <div key={label} className="mt-4 w-full">
              <p className="font-medium">{label}: ${total.toFixed(2)}</p>
              {group.map((row) => <div key={row.id} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-slate-200 py-2 text-sm last:border-b-0"><span className="w-24 tabular-nums text-slate-500">{row.date}</span><span>{row.number}</span><span className="flex-1 text-slate-500">{row.note}</span><span className="w-24 text-right font-medium tabular-nums">${row.amount.toFixed(2)}</span></div>)}
            </div>
          );
        })}

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Crew receipts</h2>
        <div data-testid="year-crew-receipts">
          {extras.receipts.length === 0 && <p className="mt-2 text-sm text-slate-500">No receipts logged by crew this year.</p>}
          {extras.receipts.length > 0 && <p className="mt-2 font-medium">Logged by crew: ${extras.receiptTotal.toFixed(2)}</p>}
          {extras.receipts.map((item) => (
            <p key={item.id} className="mt-1 text-sm">{String(item.created_at || "").slice(0, 10)} · {item.worker_name || "Crew"} · {item.kind || "other"} · {item.doc?.data?.invoiceNumber || item.doc?.title || "Job"} · ${money(item.amount).toFixed(2)} {item.note}</p>
          ))}
          {extras.receipts.length > 0 && <p className="mt-1 text-xs text-slate-500">Shown for your records. Not added to Expenses above, so nothing is counted twice if you also entered it as a job cost.</p>}
        </div>

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Billed labor and materials</h2>
        <div data-testid="year-split">
          {extras.split.tagged === 0 ? <p className="mt-2 text-sm text-slate-500">No invoices with items marked Labor or Materials this year.</p> : (
            <div className="mt-2 max-w-md text-sm">
              <div className="flex justify-between"><span>Labor</span><span className="tabular-nums">${extras.split.labor.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Materials</span><span className="tabular-nums">${extras.split.materials.toFixed(2)}</span></div>
              {extras.split.other > 0 && <div className="flex justify-between"><span>Other (not marked)</span><span className="tabular-nums">${extras.split.other.toFixed(2)}</span></div>}
              <p className="mt-1 text-xs text-slate-500">From {extras.split.tagged} invoice{extras.split.tagged === 1 ? "" : "s"} with marked items, before discount and tax.</p>
            </div>
          )}
        </div>

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Deposits on proposals</h2>
        <div data-testid="year-deposits">
          {extras.deposits.length === 0 && <p className="mt-2 text-sm text-slate-500">No deposits recorded on proposals.</p>}
          {extras.deposits.map(({ doc, payment }) => (
            <div key={`${doc.id}-${payment.id}`} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-slate-200 py-2 text-sm last:border-b-0"><span className="w-24 tabular-nums text-slate-500">{payment.date}</span><span className="flex-1">{doc.clientName}</span><span>{doc.title}</span><span className="text-slate-500">{payment.method} {payment.ref}</span><span className="w-24 text-right font-medium tabular-nums">${money(payment.amount).toFixed(2)}</span></div>
          ))}
          {extras.deposits.length > 0 && <p className="mt-1 text-xs text-slate-500">A deposit is counted in Money in once the proposal is turned into an invoice (the deposit is copied onto it).</p>}
        </div>

        <h2 className="mt-8 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Change orders and recurring invoices</h2>
        <div data-testid="year-co-recurring" className="text-sm">
          <p className="mt-2">Change orders: {extras.changeOrders.length}{extras.changeOrders.length ? ` · $${extras.changeOrders.reduce((sum, doc) => sum + invoiceTotal(doc), 0).toFixed(2)} billed` : ""}</p>
          {extras.changeOrders.map((doc) => <p key={doc.id} className="mt-1">{doc.data?.invoiceNumber || doc.title} · for {doc.data?.changeOrderOf?.number} · {doc.clientName} · ${invoiceTotal(doc).toFixed(2)}</p>)}
          <p className="mt-2">Recurring invoices: {extras.recurring.length}{extras.recurring.length ? ` · $${extras.recurring.reduce((sum, doc) => sum + invoiceTotal(doc), 0).toFixed(2)} billed` : ""}</p>
          {extras.recurring.map((doc) => <p key={doc.id} className="mt-1">{doc.data?.invoiceNumber || doc.title} · from {doc.data?.recurringFrom?.number} {doc.data?.recurringFrom?.period} · {doc.clientName} · ${invoiceTotal(doc).toFixed(2)}</p>)}
        </div>

        <p className="mt-8 text-xs text-slate-600">
          Money in counts each payment and deposit recorded on an invoice, in the year it was received. Sales and expense log. Not a tax return. Not tax advice. Meals may not be fully deductible.
          Crew pay uses the rate saved on each job. Drive time is not added as a cost.
        </p>
      </div>
    </AppShell>
  );
}