/**
 * Payment providers the owner can offer customers. Each provider knows how to describe itself to a customer
 * (text to copy, optional deep link) and which method name "Mark paid" records. Manual providers never
 * record or mark anything paid; the owner does that by hand. A hosted provider (e.g. Stripe Connect) can be
 * added later as another entry with kind "hosted" without changing the views. Existing Stripe code is separate.
 */
export type ProviderId = "zelle" | "venmo" | "cashapp" | "paypal" | "check" | "bank" | "stripe" | "card" | "cash" | "other";
export type MethodConfig = { enabled?: boolean; handle?: string; payTo?: string; address?: string; instructions?: string };
export type PaymentMethodsConfig = Partial<Record<ProviderId, MethodConfig>>;
export type PayContext = { amount: number; reference: string };
export type PayOption = { id: ProviderId; label: string; detail: string; copy: string; href?: string; hrefLabel?: string };
type Field = { key: keyof MethodConfig; label: string; placeholder: string; multiline?: boolean };

export type PaymentProvider = {
  id: ProviderId;
  label: string;
  kind: "manual" | "hosted" | "inperson";
  /** Name saved on the payment when the owner marks it paid this way (matches paymentMethods). */
  markPaidMethod: string;
  fields: Field[];
  ready: (config: MethodConfig) => boolean;
  option: (config: MethodConfig, ctx: PayContext) => PayOption;
};

const clean = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const amountText = (amount: number) => (amount > 0 ? amount.toFixed(2) : "");
const strip = (handle: string, chars: RegExp) => handle.replace(chars, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/\/.*$/, "");

export const PROVIDERS: PaymentProvider[] = [
  {
    // Online card payments through Stripe (the Pay by card button on invoice links/portal, live only when the
    // server's Stripe keys are set: /api/pay/status). Listed so the owner can offer it and record "Card";
    // customers get the card button, not a copy row, so payOptions skips hosted providers.
    id: "stripe", label: "Stripe", kind: "hosted", markPaidMethod: "Card (Stripe)",
    fields: [],
    ready: () => true,
    option: () => ({ id: "stripe", label: "Card (Stripe)", detail: "Pay online by card", copy: "" }),
  },
  {
    id: "zelle", label: "Zelle", kind: "manual", markPaidMethod: "Zelle",
    fields: [{ key: "handle", label: "Zelle email or phone", placeholder: "you@example.com or (555) 555-0100" }],
    ready: (c) => Boolean(clean(c.handle)),
    option: (c, ctx) => ({ id: "zelle", label: "Zelle", detail: `Send ${ctx.amount > 0 ? `$${amountText(ctx.amount)} ` : ""}with Zelle to ${clean(c.handle)}${ctx.reference ? ` · memo ${ctx.reference}` : ""}`, copy: clean(c.handle) }),
  },
  {
    id: "venmo", label: "Venmo", kind: "manual", markPaidMethod: "Venmo",
    fields: [{ key: "handle", label: "Venmo username", placeholder: "@your-business" }],
    ready: (c) => Boolean(strip(clean(c.handle), /^@/)),
    option: (c, ctx) => {
      const user = strip(clean(c.handle), /^@/);
      const query = new URLSearchParams({ txn: "pay", ...(ctx.amount > 0 ? { amount: amountText(ctx.amount) } : {}), ...(ctx.reference ? { note: ctx.reference } : {}) });
      return { id: "venmo", label: "Venmo", detail: `@${user}`, copy: `@${user}`, href: `https://venmo.com/${encodeURIComponent(user)}?${query.toString()}`, hrefLabel: "Open Venmo" };
    },
  },
  {
    id: "cashapp", label: "Cash App", kind: "manual", markPaidMethod: "Cash App",
    fields: [{ key: "handle", label: "Cash App $cashtag", placeholder: "$YourBusiness" }],
    ready: (c) => Boolean(strip(clean(c.handle), /^\$/)),
    option: (c, ctx) => {
      const tag = strip(clean(c.handle), /^\$/);
      return { id: "cashapp", label: "Cash App", detail: `$${tag}`, copy: `$${tag}`, href: `https://cash.app/$${encodeURIComponent(tag)}${ctx.amount > 0 ? `/${amountText(ctx.amount)}` : ""}`, hrefLabel: "Open Cash App" };
    },
  },
  {
    id: "paypal", label: "PayPal", kind: "manual", markPaidMethod: "PayPal",
    fields: [{ key: "handle", label: "PayPal.me name", placeholder: "yourbusiness" }],
    ready: (c) => Boolean(strip(clean(c.handle), /^@/)),
    option: (c, ctx) => {
      const name = strip(clean(c.handle).replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, ""), /^@/);
      const href = `https://paypal.me/${encodeURIComponent(name)}${ctx.amount > 0 ? `/${amountText(ctx.amount)}USD` : ""}`;
      return { id: "paypal", label: "PayPal", detail: `paypal.me/${name}`, copy: `https://paypal.me/${name}`, href, hrefLabel: "Open PayPal" };
    },
  },
  {
    id: "check", label: "Check", kind: "manual", markPaidMethod: "Check",
    fields: [
      { key: "payTo", label: "Make checks payable to", placeholder: "Your Business LLC" },
      { key: "address", label: "Mail checks to", placeholder: "123 Main St, City, ST 00000", multiline: true },
    ],
    ready: (c) => Boolean(clean(c.payTo) || clean(c.address, 500)),
    option: (c, ctx) => {
      const text = [clean(c.payTo) && `Payable to ${clean(c.payTo)}`, clean(c.address, 500) && `Mail to ${clean(c.address, 500)}`, ctx.reference && `Write ${ctx.reference} on the memo line`].filter(Boolean).join(". ");
      return { id: "check", label: "Check by mail", detail: text, copy: [clean(c.payTo), clean(c.address, 500)].filter(Boolean).join("\n") };
    },
  },
  {
    id: "bank", label: "Bank transfer (ACH)", kind: "manual", markPaidMethod: "Bank",
    fields: [{ key: "instructions", label: "Bank / ACH instructions", placeholder: "Bank name, routing and account number, or how to request them", multiline: true }],
    ready: (c) => Boolean(clean(c.instructions, 1000)),
    option: (c, ctx) => ({ id: "bank", label: "Bank transfer (ACH)", detail: `${clean(c.instructions, 1000)}${ctx.reference ? `\nReference: ${ctx.reference}` : ""}`, copy: clean(c.instructions, 1000) }),
  },
  // Taken in person; recorded when marking paid, never shown to customers as a copy row.
  { id: "card", label: "Credit/debit card", kind: "inperson", markPaidMethod: "Card", fields: [], ready: () => true, option: () => ({ id: "card", label: "Credit/debit card", detail: "", copy: "" }) },
  { id: "cash", label: "Cash", kind: "inperson", markPaidMethod: "Cash", fields: [], ready: () => true, option: () => ({ id: "cash", label: "Cash", detail: "", copy: "" }) },
  { id: "other", label: "Other", kind: "inperson", markPaidMethod: "Other", fields: [], ready: () => true, option: () => ({ id: "other", label: "Other", detail: "", copy: "" }) },
];

export const providerFor = (id: string) => PROVIDERS.find((provider) => provider.id === id);

/** Only known providers and known fields, trimmed. */
export function readPaymentMethods(raw: unknown): PaymentMethodsConfig {
  const out: PaymentMethodsConfig = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const provider of PROVIDERS) {
    const item = (raw as Record<string, unknown>)[provider.id];
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const cfg: MethodConfig = { enabled: src.enabled === true };
    for (const key of ["handle", "payTo", "address", "instructions"] as const) {
      const value = clean(src[key], key === "instructions" ? 1000 : key === "address" ? 500 : 200);
      if (value) cfg[key] = value;
    }
    out[provider.id] = cfg;
  }
  return out;
}

/** Options to show a customer, in provider order. Public data from the RPC has no "enabled" flag: everything there is enabled. */
export function payOptions(config: PaymentMethodsConfig, ctx: PayContext, publicCopy = false): PayOption[] {
  return PROVIDERS.filter((provider) => {
    const cfg = config[provider.id];
    return provider.kind === "manual" && cfg && (publicCopy || cfg.enabled) && provider.ready(cfg);
  }).map((provider) => provider.option(config[provider.id]!, ctx));
}

/** Methods the owner can record when marking paid: cash first, then enabled providers, then the rest. */
export function markPaidChoices(config: PaymentMethodsConfig, all: string[]) {
  const enabled = PROVIDERS.filter((provider) => config[provider.id]?.enabled).map((provider) => provider.markPaidMethod);
  return [...new Set(["Cash", ...enabled, ...all])];
}

export const PAYMENT_METHODS_KEY = "clientready-payment-methods";
export function readLocalPaymentMethods(): PaymentMethodsConfig {
  try {
    return readPaymentMethods(JSON.parse(window.localStorage.getItem(PAYMENT_METHODS_KEY) || "{}"));
  } catch {
    return {};
  }
}
