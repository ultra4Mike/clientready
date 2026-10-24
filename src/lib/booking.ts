/** Online booking form: shared shapes and client-side checks (the RPC submit_booking_request re-checks everything). */
export type BookingPage = { business: string; services: string[] };
export type BookingForm = { name: string; phone: string; email: string; address: string; service: string; preferred: string; note: string; photos: string[]; website?: string };

export const BOOKING_MAX_PHOTOS = 3;
export const BOOKING_PHOTO_MAX_CHARS = 450_000;
const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validOwnerKey(key: string) {
  return SLUG.test(key.toLowerCase()) || UUID.test(key);
}

/** Owner setting: a URL-safe slug from a business name. */
export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function bookingError(form: BookingForm, services: string[] = []): string {
  if (!String(form.name || "").trim()) return "Please enter your name.";
  if (services.length && !String(form.service || "").trim()) return "Please choose a service.";
  const digits = String(form.phone || "").replace(/\D/g, "");
  if (!String(form.email || "").trim() && digits.length < 7) return "Please enter a phone number or email so we can reach you.";
  if (String(form.email || "").trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(form.email).trim())) return "That email doesn't look right.";
  const photos = Array.isArray(form.photos) ? form.photos : [];
  if (photos.length > BOOKING_MAX_PHOTOS) return `Up to ${BOOKING_MAX_PHOTOS} photos.`;
  if (photos.some((p) => !/^data:image\/(jpeg|png|webp);base64,/.test(p) || p.length > BOOKING_PHOTO_MAX_CHARS)) return "A photo is too large or not an image.";
  return "";
}

export function servicesFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.map((s) => String(s).trim()).filter(Boolean).slice(0, 30) : [];
}

/** Owner Settings text area (one per line) to the saved list. */
export function parseServices(text: string): string[] {
  return Array.from(new Set(text.split(/\n/).map((s) => s.trim().slice(0, 80)).filter(Boolean))).slice(0, 30);
}

export const BOOKING_RPC_ERRORS: Record<string, string> = {
  not_found: "Online booking isn't available for this business.",
  rate: "Too many requests right now. Please try again later.",
  invalid: "Please check your name and contact details.",
  photos: "A photo is too large or not an image.",
};
