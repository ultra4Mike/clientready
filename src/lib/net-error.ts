/** Raw browser network errors ("Failed to fetch", "Load failed", "NetworkError…") become one plain sentence. */
export const OFFLINE_MESSAGE = "Can't reach the server. Check your connection and try again.";
export function friendlyError(message: string | null | undefined) {
  const m = String(message || "");
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|ERR_INTERNET|ECONNREFUSED/i.test(m) ? OFFLINE_MESSAGE : m;
}
