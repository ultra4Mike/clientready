import { csvCell } from "@/lib/timesheet-csv";
import { docAmounts } from "@/lib/doc-stage";
import { readPayments } from "@/lib/payments";
import { methodLabel } from "@/lib/payments";
import { uniqueDocs } from "@/lib/change-orders";
import { zipFiles } from "@/lib/zip";

/**
 * Account export: the whole account (pulled from the cloud first, so not only this device) as one ZIP of CSVs
 * that open in any spreadsheet, plus backup.json. Read-only; nothing is changed or sent anywhere.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((row) => row.map((cell) => csvCell(s(cell))).join(",")).join("\r\n") + "\r\n";
}

/** R34: no live customer links in an export: drop every token/link-bearing key, keep approval status only. */
export function stripLinks<T>(value: T): T {
  const walk = (v: unknown, key = ""): unknown => {
    if (Array.isArray(v)) return v.map((item) => walk(item));
    if (v && typeof v === "object") {
      const out: Row = {};
      for (const [k, child] of Object.entries(v as Row)) {
        if (/token|portal|secret/i.test(k)) continue;
        out[k] = walk(child, k);
      }
      return out;
    }
    if (typeof v === "string" && /[?&](t|p|token)=[A-Za-z0-9_-]{16,}/.test(v)) return "";
    void key;
    return v;
  };
  return walk(value) as T;
}

export function exportFiles(raw: { profile: Row | null; clients: Row[]; documents: Row[]; employees: Row[] }) {
  const input = stripLinks(raw);
  const docs = uniqueDocs(input.documents as never) as unknown as { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Row }[];
  const clients = toCsv(["Name", "Company", "Email", "Phone", "Address", "Notes", "Preferences", "Contact method"], input.clients.map((c) => [c.name, c.company, c.email, c.phone, c.address, c.notes, c.preferences, c.contactMethod]));
  const documents = toCsv(["Type", "Number", "Client", "Status", "Date", "Due", "Total", "Paid", "Owed", "Job date"], docs.map((d) => {
    const data = d.data || {};
    const { total, paid, owed } = docAmounts(d as never);
    return [d.type, data.invoiceNumber || d.title, d.clientName || data.clientName, data.status || "draft", data.invoiceDate || d.createdAt, data.dueDate, total.toFixed(2), paid.toFixed(2), owed.toFixed(2), (data.schedule as Row | undefined)?.date];
  }));
  const items = toCsv(["Number", "Client", "Description", "Qty", "Rate"], docs.flatMap((d) => (Array.isArray(d.data?.items) ? (d.data?.items as Row[]) : []).map((i) => [d.data?.invoiceNumber || d.title, d.clientName, i.description, i.qty, i.rate])));
  const payments = toCsv(["Number", "Client", "Date", "Amount", "Method", "Reference", "Tip"], docs.flatMap((d) => readPayments(d.data || {}).filter((p) => Number(p.amount) > 0).map((p) => [d.data?.invoiceNumber || d.title, d.clientName, p.date, p.amount, p.method ? methodLabel(p.method) : "", p.ref, p.tip])));
  const employees = toCsv(["Name", "Type", "Phone", "Role", "Rate", "Hire date", "Active"], input.employees.map((e) => [e.name, e.kind, e.phone, e.role, e.rate, e.hireDate, e.active === false ? "no" : "yes"]));
  const backup = JSON.stringify({ savedAt: new Date().toISOString(), profile: input.profile, clients: input.clients, documents: input.documents, employees: input.employees }, null, 2);
  return [
    { name: "clients.csv", text: clients }, { name: "documents.csv", text: documents }, { name: "line-items.csv", text: items },
    { name: "payments.csv", text: payments }, { name: "employees.csv", text: employees }, { name: "backup.json", text: backup },
  ];
}

export function exportZip(input: Parameters<typeof exportFiles>[0]) {
  return zipFiles(exportFiles(input));
}
