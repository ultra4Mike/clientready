import type { MouseEvent } from "react";

type CameraPlugin = {
  getPhoto: (options: Record<string, unknown>) => Promise<{ dataUrl?: string; format?: string }>;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { Camera?: CameraPlugin } };

function camera(): CameraPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() && cap.Plugins?.Camera ? cap.Plugins.Camera : null;
}

export function nativeCameraAvailable() {
  return Boolean(camera());
}

/**
 * In the iOS/Android app, opens the native camera / photo library sheet (@capacitor/camera) and
 * returns the photo as a File, so it goes through the same compression as a web pick. Cancel -> null.
 */
export async function pickNativePhoto(source: "PROMPT" | "CAMERA" | "PHOTOS" = "PROMPT"): Promise<File | null> {
  const plugin = camera();
  if (!plugin) return null;
  try {
    const photo = await plugin.getPhoto({ resultType: "dataUrl", source, quality: 80, width: 2048, correctOrientation: true, saveToGallery: false, promptLabelHeader: "Job photo" });
    if (!photo.dataUrl) return null;
    const blob = await (await fetch(photo.dataUrl)).blob();
    const type = blob.type || `image/${photo.format || "jpeg"}`;
    return new File([blob], `photo.${type.split("/")[1] || "jpg"}`, { type });
  } catch {
    return null; // cancelled or permission denied: nothing added
  }
}

/**
 * onClick for a photo <input type="file">: in the native app it opens the native picker instead and
 * hands the File to onFiles; on the web it does nothing and the normal file picker opens.
 */
export function nativePhotoClick(onFiles: (files: File[]) => void, source: "PROMPT" | "CAMERA" | "PHOTOS" = "PROMPT") {
  return (event: MouseEvent<HTMLInputElement>) => {
    if (!nativeCameraAvailable()) return;
    event.preventDefault();
    void pickNativePhoto(source).then((file) => { if (file) onFiles([file]); });
  };
}
