/** tag: "before" / "after" the work (optional). */
export type PhotoTag = "" | "before" | "after";
export type JobPhoto = { id: string; dataUrl: string; caption: string; addedAt: string; tag?: PhotoTag };
export const PHOTO_TAG_LABEL: Record<Exclude<PhotoTag, "">, string> = { before: "Before", after: "After" };
const tagOf = (value: unknown): PhotoTag => (value === "before" || value === "after" ? value : "");
/** Before photos first, then untagged, then after; stable within each group. */
export function orderByTag(photos: JobPhoto[]) {
  const rank = (photo: JobPhoto) => (photo.tag === "before" ? 0 : photo.tag === "after" ? 2 : 1);
  return photos.map((photo, index) => ({ photo, index })).sort((a, b) => rank(a.photo) - rank(b.photo) || a.index - b.index).map(({ photo }) => photo);
}

export const MAX_PHOTOS = 6;
const MAX_EDGE = 1024;
const TARGET_BYTES = 150 * 1024;

/** Approximate decoded size of a data URL in bytes. */
export function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

export function readPhotos(value: unknown): JobPhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const item = (raw || {}) as Partial<JobPhoto>;
      const tag = tagOf(item.tag);
      return { id: String(item.id || `ph${index}`), dataUrl: String(item.dataUrl || ""), caption: String(item.caption || ""), addedAt: String(item.addedAt || ""), ...(tag ? { tag } : {}) };
    })
    .filter((photo) => /^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl))
    .slice(0, MAX_PHOTOS);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Shrinks a photo to at most 1024px on the long edge as JPEG (~0.7 quality), stepping
 * quality/size down until it is under ~150KB. Throws a friendly message for files the
 * browser cannot decode (HEIC on most desktop browsers, RAW, etc.).
 */
export async function compressPhoto(file: File) {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    const heic = /hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
    throw new Error(
      heic
        ? `${file.name}: HEIC photos can't be read in this browser. On iPhone set Camera > Formats > Most Compatible, or share the photo as JPEG.`
        : `${file.name}: this file type can't be read. Use a JPEG or PNG photo.`
    );
  }
  const steps: [number, number][] = [[MAX_EDGE, 0.7], [MAX_EDGE, 0.55], [800, 0.55], [640, 0.5]];
  let dataUrl = "";
  for (const [edge, quality] of steps) {
    dataUrl = encode(img, edge, quality);
    if (dataUrlBytes(dataUrl) <= TARGET_BYTES) break;
  }
  return dataUrl;
}

export function isQuotaError(error: unknown) {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22 || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}
