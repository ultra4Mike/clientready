export type Signature = {
  type: "drawn" | "typed";
  dataUrl?: string;
  text?: string;
  signerName: string;
  signedAt: string;
};

export const SIGNATURE_DISCLAIMER =
  "Signature is for verification of agreement only. It is not a certified legal e-signature.";

export const scriptFont = "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', 'Apple Chancery', cursive";

/** Reads a saved signature. Anything missing or malformed means no signature. */
export function readSignature(value: unknown): Signature | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Signature>;
  if (raw.type !== "drawn" && raw.type !== "typed") return null;
  if (raw.type === "drawn" && !String(raw.dataUrl || "").startsWith("data:image/png")) return null;
  if (raw.type === "typed" && !String(raw.text || "").trim()) return null;
  return {
    type: raw.type,
    dataUrl: raw.type === "drawn" ? String(raw.dataUrl) : undefined,
    text: raw.type === "typed" ? String(raw.text) : undefined,
    signerName: String(raw.signerName || ""),
    signedAt: String(raw.signedAt || ""),
  };
}

export function signedAtLabel(signedAt: string) {
  if (!signedAt) return "";
  const date = new Date(signedAt);
  if (Number.isNaN(date.getTime())) return signedAt;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
