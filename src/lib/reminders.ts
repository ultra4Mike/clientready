export type ReminderTone = "friendly" | "firm" | "final";

export type ReminderInput = {
  clientName: string;
  invoiceNumber: string;
  owed: number;
  dueDate: string;
  payUrl: string;
  businessName: string;
  ownerName?: string;
  today?: string;
};

function dateText(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function firstName(name: string) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

/** Ready-to-copy reminder texts. Nothing here sends anything. */
export function reminderText(tone: ReminderTone, input: ReminderInput) {
  const name = firstName(input.clientName);
  const amount = `$${input.owed.toFixed(2)}`;
  const inv = input.invoiceNumber ? `invoice ${input.invoiceNumber}` : "your invoice";
  const due = input.dueDate ? dateText(input.dueDate) : "";
  const pastDue = Boolean(input.dueDate && input.today && input.dueDate < input.today);
  const pay = input.payUrl ? ` You can pay here: ${input.payUrl}` : "";
  const sign = `\n\n${input.ownerName ? `${input.ownerName}, ` : ""}${input.businessName || "Thank you"}`.replace(/, $/, "");
  if (tone === "friendly") {
    return `Hi ${name}, just a friendly reminder that ${inv} for ${amount} ${due ? (pastDue ? `was due ${due}` : `is due ${due}`) : "is still open"}.${pay} Thanks so much!${sign}`;
  }
  if (tone === "firm") {
    return `Hi ${name}, ${inv} still shows ${amount} owed${due ? `, which ${pastDue ? "was" : "is"} due ${due}` : ""}. Please send payment as soon as possible, or let me know if there is a problem.${pay}${sign}`;
  }
  return `Hi ${name}, this is a final reminder that ${inv} has ${amount} past due${due ? ` since ${due}` : ""}. Please pay within 7 days or contact me to set up a plan.${pay}${sign}`;
}

export function reminderSubject(tone: ReminderTone, input: ReminderInput) {
  const inv = input.invoiceNumber || "Invoice";
  if (tone === "final") return `Final reminder: ${inv} ($${input.owed.toFixed(2)} past due)`;
  if (tone === "firm") return `Payment needed: ${inv} ($${input.owed.toFixed(2)})`;
  return `Reminder: ${inv} ($${input.owed.toFixed(2)})`;
}

export function smsHref(phone: string, body: string) {
  const number = (phone || "").replace(/[^\d+]/g, "");
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
}

export function mailtoHref(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent((email || "").trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
