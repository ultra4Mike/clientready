// Ready-made "you're scheduled" and "job complete" messages the owner opens in their own text/email app. Never sent automatically.
import type { Schedule } from "@/lib/schedule";

const first = (name: string) => name.trim().split(/\s+/)[0] || "there";
const biz = (name: string) => (name.trim() && name !== "Your business" ? name.trim() : "us");
function when(date: string, time?: string) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  if (!time) return day;
  const [h, min] = time.split(":").map(Number);
  return `${day} at ${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function scheduledMessage(clientName: string, businessName: string, schedule: Pick<Schedule, "date" | "startTime">) {
  return `Hi ${first(clientName)}, this is ${biz(businessName)}. You're on our schedule for ${when(schedule.date, schedule.startTime)}. Reply here if you need to change the time. Thank you!`;
}

export function completeMessage(clientName: string, businessName: string, invoiceNumber: string) {
  const inv = invoiceNumber.trim() ? ` Invoice ${invoiceNumber.trim()} is on its way.` : "";
  return `Hi ${first(clientName)}, this is ${biz(businessName)}. We've finished the job, thank you for having us!${inv} Let us know if anything needs a second look.`;
}

export function mailHref(email: string, subject: string, body: string) {
  return email.trim() ? `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "";
}
