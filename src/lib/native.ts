/**
 * Inside the iOS/Android shell (window.Capacitor injected by the native app). App store rules: the
 * native app shows no prices, plans or purchase buttons/links; it is login + the app only.
 * The <html> element gets class "native-app" before first paint (inline script in layout.tsx), and
 * anything marked data-purchase is hidden by CSS; pages that are only about buying redirect to /login.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean((window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Same check as isNativeApp, as an inline script for <head> (runs before React). */
export const NATIVE_CLASS_SCRIPT = `try{var c=window.Capacitor;if(c&&c.isNativePlatform&&c.isNativePlatform())document.documentElement.classList.add('native-app');}catch(e){}`;
