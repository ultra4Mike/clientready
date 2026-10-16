/** A client's preferred way to be contacted. Owner-only; shown as a hint and used to put that option first. Nothing is ever sent automatically. */
export type ContactMethod = "" | "email" | "text" | "call";
export const CONTACT_METHODS: { value: Exclude<ContactMethod, "">; label: string; icon: string }[] = [
  { value: "text", label: "Text", icon: "💬" },
  { value: "call", label: "Call", icon: "📞" },
  { value: "email", label: "Email", icon: "✉️" },
];
export const readContactMethod = (value: unknown): ContactMethod => (value === "email" || value === "text" || value === "call" ? value : "");
export const contactMethodLabel = (value: unknown) => CONTACT_METHODS.find((item) => item.value === value)?.label || "";

/** Preferred method of a saved client on this device, by id, else by a unique name match. */
export function preferredContactFor(clientId: unknown, clientName?: unknown): ContactMethod {
  if (typeof window === "undefined") return "";
  let clients: { id?: string; name?: string; contactMethod?: unknown }[] = [];
  try { clients = JSON.parse(window.localStorage.getItem("clientready-clients") || "[]"); } catch { return ""; }
  if (!Array.isArray(clients)) return "";
  const byId = clientId ? clients.find((client) => client && client.id === clientId) : undefined;
  if (byId) return readContactMethod(byId.contactMethod);
  const name = String(clientName || "").trim().toLowerCase();
  const named = name ? clients.filter((client) => client && String(client.name || "").trim().toLowerCase() === name) : [];
  return named.length === 1 ? readContactMethod(named[0].contactMethod) : "";
}
