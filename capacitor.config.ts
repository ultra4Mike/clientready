import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shells (iOS/Android) load the live web app, because ClientReady needs its server routes
 * (/api/*) and can't be a static export. Point at another deployment with CAP_SERVER_URL when running
 * `npx cap sync`. If the server can't be reached, cap-shell/offline.html is shown.
 * appId is a placeholder until the owner registers the bundle id with Apple/Google.
 */
const serverUrl = process.env.CAP_SERVER_URL || "https://clientreadyapp.com";

const config: CapacitorConfig = {
  appId: "app.clientready.mobile",
  appName: "ClientReady",
  webDir: "cap-shell",
  server: {
    url: `${serverUrl.replace(/\/$/, "")}/dashboard`,
    errorPath: "offline.html",
    cleartext: serverUrl.startsWith("http://"),
  },
  ios: { contentInset: "never", scheme: "ClientReady" },
  android: { allowMixedContent: false },
};

export default config;
