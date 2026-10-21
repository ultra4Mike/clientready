/**
 * QuickBooks Online + Xero: endpoints and pure mapping from ClientReady data. One-way, create-only:
 * clients -> customers/contacts, sent/paid invoices -> invoices, payments -> payments. Totals match ClientReady
 * exactly (discount and tax go over as their own lines, so the accounting tax engine isn't re-applied).
 */
import { documentTotals, discountAmount } from "@/lib/discount";
import { readPayments } from "@/lib/payments";

export type Provider = "quickbooks" | "xero";
export const PROVIDERS: Provider[] = ["quickbooks", "xero"];
export const PROVIDER_LABEL: Record<Provider, string> = { quickbooks: "QuickBooks Online", xero: "Xero" };

export type ProviderConfig = {
  clientId: string; clientSecret: string; authorizeUrl: string; tokenUrl: string; apiBase: string; scope: string; connectionsUrl?: string;
};

/** Server only: reads the app keys from env (never stored in the repo). Empty clientId = not configured. */
export function providerConfig(provider: Provider, env: Record<string, string | undefined> = process.env): ProviderConfig {
  if (provider === "quickbooks") {
    const production = env.QBO_ENVIRONMENT === "production";
    return {
      clientId: env.QBO_CLIENT_ID || "", clientSecret: env.QBO_CLIENT_SECRET || "",
      authorizeUrl: env.QBO_AUTHORIZE_URL || "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: env.QBO_TOKEN_URL || "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      apiBase: env.QBO_API_BASE || (production ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com"),
      scope: "com.intuit.quickbooks.accounting",
    };
  }
  return {
    clientId: env.XERO_CLIENT_ID || "", clientSecret: env.XERO_CLIENT_SECRET || "",
    authorizeUrl: env.XERO_AUTHORIZE_URL || "https://login.xero.com/identity/connect/authorize",
    tokenUrl: env.XERO_TOKEN_URL || "https://identity.xero.com/connect/token",
    apiBase: env.XERO_API_BASE || "https://api.xero.com",
    connectionsUrl: (env.XERO_API_BASE || "https://api.xero.com") + "/connections",
    scope: "offline_access accounting.transactions accounting.contacts",
  };
}

export function authorizeUrl(provider: Provider, config: ProviderConfig, redirectUri: string, state: string) {
  const query = new URLSearchParams({ client_id: config.clientId, response_type: "code", scope: config.scope, redirect_uri: redirectUri, state });
  return `${config.authorizeUrl}?${query.toString()}`;
}

const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const r2 = (value: number) => Math.round(value * 100) / 100;
const isoDate = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "");

export type LocalClient = { id: string; name: string; email?: string | null; phone?: string | null; address?: string | null; company?: string | null };
export type LocalInvoice = { id: string; title: string; client_name: string; data: Record<string, unknown> };
type Item = { description?: string; qty?: string; rate?: string };

/** Lines, discount and tax for an invoice, matching ClientReady's own totals. */
export function invoiceFigures(data: Record<string, unknown>) {
  const items = (Array.isArray(data.items) ? data.items : []) as Item[];
  const lines = items.filter((item) => num(item.qty) * num(item.rate) !== 0 || String(item.description || "").trim())
    .map((item) => ({ description: String(item.description || "Item").slice(0, 4000), qty: num(item.qty) || 1, rate: num(item.rate), amount: r2((num(item.qty) || 1) * num(item.rate)) }));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const totals = documentTotals(subtotal, data.taxPercent, data.discountType, data.discountValue);
  return { lines, subtotal: r2(subtotal), discount: r2(discountAmount(subtotal, data.discountType, data.discountValue)), tax: r2(totals.tax), total: r2(totals.total) };
}

/** Payments worth sending (positive amounts), with a stable local id. */
export function invoicePayments(invoice: LocalInvoice) {
  return readPayments(invoice.data as never).filter((payment) => num(payment.amount) > 0)
    .map((payment, index) => ({ localId: `${invoice.id}:${payment.id || index}`, amount: r2(num(payment.amount)), date: isoDate(payment.date) || isoDate(invoice.data.invoiceDate), method: payment.method || "" }));
}

/** Only real invoices go over: sent, partly paid or paid (never drafts). */
export function shouldSync(invoice: LocalInvoice) {
  const status = String(invoice.data.status || "draft");
  return status !== "draft" && invoiceFigures(invoice.data).total > 0;
}

export function qboCustomer(client: LocalClient) {
  return {
    DisplayName: client.name.slice(0, 100),
    ...(client.company ? { CompanyName: client.company.slice(0, 100) } : {}),
    ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
    ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone.slice(0, 30) } } : {}),
    ...(client.address ? { BillAddr: { Line1: client.address.slice(0, 500) } } : {}),
  };
}

export function qboInvoice(invoice: LocalInvoice, customerId: string, itemId = "1") {
  const f = invoiceFigures(invoice.data);
  const line = (amount: number, description: string, qty: number, rate: number) => ({ Amount: amount, DetailType: "SalesItemLineDetail", Description: description, SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: qty, UnitPrice: rate } });
  return {
    CustomerRef: { value: customerId },
    DocNumber: String(invoice.data.invoiceNumber || invoice.title || "").slice(0, 21),
    ...(isoDate(invoice.data.invoiceDate) ? { TxnDate: isoDate(invoice.data.invoiceDate) } : {}),
    ...(isoDate(invoice.data.dueDate) ? { DueDate: isoDate(invoice.data.dueDate) } : {}),
    Line: [
      ...f.lines.map((l) => line(l.amount, l.description, l.qty, l.rate)),
      ...(f.discount > 0 ? [{ Amount: f.discount, DetailType: "DiscountLineDetail", DiscountLineDetail: { PercentBased: false } }] : []),
      ...(f.tax > 0 ? [line(f.tax, "Sales tax (from ClientReady)", 1, f.tax)] : []),
    ],
  };
}

export function qboPayment(customerId: string, invoiceRemoteId: string, payment: { amount: number; date: string }) {
  return { CustomerRef: { value: customerId }, TotalAmt: payment.amount, ...(payment.date ? { TxnDate: payment.date } : {}), Line: [{ Amount: payment.amount, LinkedTxn: [{ TxnId: invoiceRemoteId, TxnType: "Invoice" }] }] };
}

export function xeroContact(client: LocalClient) {
  return {
    Name: client.name.slice(0, 255),
    ...(client.email ? { EmailAddress: client.email } : {}),
    ...(client.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: client.phone.slice(0, 50) }] } : {}),
    ...(client.address ? { Addresses: [{ AddressType: "STREET", AddressLine1: client.address.slice(0, 500) }] } : {}),
  };
}

export function xeroInvoice(invoice: LocalInvoice, contactId: string, accountCode = "200") {
  const f = invoiceFigures(invoice.data);
  const item = (description: string, qty: number, rate: number) => ({ Description: description, Quantity: qty, UnitAmount: rate, AccountCode: accountCode, TaxType: "NONE" });
  return {
    Type: "ACCREC", Contact: { ContactID: contactId }, Status: "AUTHORISED", LineAmountTypes: "NoTax",
    InvoiceNumber: String(invoice.data.invoiceNumber || invoice.title || "").slice(0, 255),
    Date: isoDate(invoice.data.invoiceDate) || new Date().toISOString().slice(0, 10),
    DueDate: isoDate(invoice.data.dueDate) || isoDate(invoice.data.invoiceDate) || new Date().toISOString().slice(0, 10),
    LineItems: [
      ...f.lines.map((l) => item(l.description, l.qty, l.rate)),
      ...(f.discount > 0 ? [item("Discount", 1, -f.discount)] : []),
      ...(f.tax > 0 ? [item("Sales tax (from ClientReady)", 1, f.tax)] : []),
    ],
  };
}

export function xeroPayment(invoiceRemoteId: string, payment: { amount: number; date: string }, accountCode = "090") {
  return { Invoice: { InvoiceID: invoiceRemoteId }, Account: { Code: accountCode }, Amount: payment.amount, Date: payment.date || new Date().toISOString().slice(0, 10) };
}
