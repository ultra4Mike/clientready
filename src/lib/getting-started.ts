import { paidTotal, readPayments } from "@/lib/payments";
import { readEmailLog } from "@/lib/email";
import { payOptions, readLocalPaymentMethods } from "@/lib/payments/providers";

/** Getting-started flags. Read-only; nothing here sends or changes anything. */
export type SetupKey = "logo" | "client" | "invoice-sent" | "payment-method" | "payment-received";
/** Same shape as the design bot's ChecklistItem, plus a stable key. */
export type SetupItem = { key: SetupKey; label: string; done: boolean; href: string };

type Doc = { type: string; data?: Record<string, unknown> };
/** manualMethods: enabled manual payment methods with details filled in (Zelle, Venmo, … from Settings, 81a2084). */
export type SetupInput = { logo: string; paymentLink: string; stripeEnabled: boolean; clientCount: number; documents: Doc[]; manualMethods?: number };

export function setupFlags(input: SetupInput): Record<SetupKey, boolean> {
  const invoices = input.documents.filter((doc) => doc.type === "invoice");
  return {
    logo: Boolean(input.logo),
    client: input.clientCount > 0,
    "invoice-sent": invoices.some((doc) => String(doc.data?.status || "draft") !== "draft" || readEmailLog(doc.data?.emailLog).length > 0),
    "payment-method": Boolean(input.paymentLink.trim()) || input.stripeEnabled || (input.manualMethods || 0) > 0,
    "payment-received": invoices.some((doc) => paidTotal(readPayments(doc.data)) > 0 || doc.data?.status === "paid"),
  };
}

export function setupChecklist(input: SetupInput): SetupItem[] {
  const flags = setupFlags(input);
  return [
    { key: "logo", label: "Add your logo", done: flags.logo, href: "/profile#payments" },
    { key: "client", label: "Add your first client", done: flags.client, href: "/clients" },
    { key: "invoice-sent", label: "Send your first invoice", done: flags["invoice-sent"], href: "/invoice" },
    { key: "payment-method", label: "Set how customers pay (pay link or card payments)", done: flags["payment-method"], href: "/profile#payments" },
    { key: "payment-received", label: "Record your first payment", done: flags["payment-received"], href: "/collect" },
  ];
}

/** Reads the local profile/clients cache and asks the server whether card payments are on (yes/no). */
export async function readSetupInput(documents: Doc[]): Promise<SetupInput> {
  const parse = <T,>(key: string, fallback: T): T => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const profile = parse<{ logo?: string; paymentLink?: string }>("clientready-profile", {});
  const clients = parse<unknown[]>("clientready-clients", []);
  let stripeEnabled = false;
  try {
    const response = await fetch("/api/pay/status", { cache: "no-store" });
    stripeEnabled = response.ok && Boolean((await response.json()).enabled);
  } catch {
    stripeEnabled = false;
  }
  const manualMethods = payOptions(readLocalPaymentMethods(), { amount: 0, reference: "" }).length;
  return { logo: profile.logo || "", paymentLink: profile.paymentLink || "", stripeEnabled, clientCount: Array.isArray(clients) ? clients.length : 0, documents, manualMethods };
}
