/** Hosts whose https links open inside the app (App Links / Universal Links). */
export const APP_LINK_HOSTS = ["clientready-six.vercel.app"];

/**
 * Turns a link the OS handed to the native app into an in-app path, or "" to ignore it.
 * https://<app host>/invoice?id=1 -> /invoice?id=1; clientready://invoice?id=1 -> /invoice?id=1.
 * Anything else (other hosts, javascript:, protocol-relative tricks) is ignored.
 */
export function deepLinkPath(raw: string, currentHost = ""): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  let path = "";
  if (url.protocol === "https:" && (APP_LINK_HOSTS.includes(url.host) || (currentHost && url.host === currentHost))) {
    path = url.pathname + url.search + url.hash;
  } else if (url.protocol === "clientready:") {
    // clientready://invoice?id=1 parses with host "invoice"; clientready:///invoice too.
    path = `/${[url.host, url.pathname.replace(/^\/+/, "")].filter(Boolean).join("/")}${url.search}${url.hash}`;
  } else {
    return "";
  }
  path = path.replace(/^\/{2,}/, "/");
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f]/.test(path)) return "";
  return path === "/" ? "/dashboard" : path;
}
