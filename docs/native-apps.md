# Native apps (Capacitor 8)

`ios/` and `android/` are Capacitor shells around the **live** web app (`server.url` in
`capacitor.config.ts`, default `https://clientready-six.vercel.app/dashboard`). ClientReady needs its server
routes (`/api/*`), so a static export isn't possible; `cap-shell/` is only the bundled fallback
(`index.html`, and `offline.html` when the server can't be reached).

- Point at another deployment: `CAP_SERVER_URL=https://staging.example npm run cap:sync`
- The Capacitor CLI needs **Node 22+** (`npx -p node@22 npm run cap:sync` works on Node 20).
- Web code has no Capacitor import: `src/components/NativeBridge.tsx` uses the `window.Capacitor` the
  native app injects (deep links via `appUrlOpen`, Android back button). On the web it does nothing.

## SDKs added
| Package | Version | Where | Why |
|---|---|---|---|
| @capacitor/core | 8.5.3 | dependency | runtime bridge (native side; not imported by web code) |
| @capacitor/ios | 8.5.3 | dependency | iOS platform (Swift Package Manager, no CocoaPods) |
| @capacitor/android | 8.5.3 | dependency | Android platform (Gradle) |
| @capacitor/app | 8.1.2 | dependency | deep links (`appUrlOpen`) + Android back button |
| @capacitor/cli | 8.5.3 | devDependency | `cap sync` / `cap open` |

Native SDKs the generated projects pull in:
- Android (Gradle, `android/variables.gradle`): androidx.appcompat 1.7.1, androidx.coordinatorlayout 1.3.0,
  androidx.core:core-splashscreen 1.2.0, androidx.activity 1.11.0, androidx.core 1.17.0, androidx.fragment 1.8.9,
  androidx.webkit 1.14.0, Capacitor's `capacitor-android` and `capacitor-cordova-android-plugins` (Cordova 14.0.1
  compatibility layer, empty); test-only: junit 4.13.2, androidx.test.ext:junit 1.3.0, espresso-core 3.7.0.
  minSdk 24, compile/target SDK 36.
- iOS (Swift Package Manager, `ios/App/CapApp-SPM/Package.swift`): capacitor-swift-pm 8.5.3 (Capacitor + Cordova
  products) and the local CapacitorApp plugin.

No analytics, ads, push, or crash-reporting SDKs.

## Deep links
- Custom scheme `clientready://<path>` (both platforms): works without any account setup.
- https links to `clientready-six.vercel.app` open the app once the site proves ownership:
  - Android App Links: serve `/.well-known/assetlinks.json` with the **release signing SHA-256** (template below).
  - iOS Universal Links: `ios/App/App/App.entitlements` has `applinks:clientready-six.vercel.app`; serve
    `/.well-known/apple-app-site-association` with the **Apple Team ID** (template below). Associated Domains
    needs a paid Apple Developer team; remove the entitlement to build with a free/personal team.
  These files are not in `public/` yet on purpose: placeholder values would publish a broken verification file.

```json
// public/.well-known/assetlinks.json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "app.clientready.mobile",
               "sha256_cert_fingerprints": ["<RELEASE KEY SHA-256>"] } }]
```
```json
// public/.well-known/apple-app-site-association (no extension, served as application/json)
{ "applinks": { "details": [{ "appIDs": ["<TEAMID>.app.clientready.mobile"], "components": [{ "/": "/*" }] }] } }
```

## Needs the owner's Mac or accounts
- **Mac + Xcode** (iOS build, simulator, archive, upload). Open with `npm run cap:open:ios`.
- **Apple Developer account** ($99/yr): signing team, bundle id `app.clientready.mobile` (placeholder, change
  in `capacitor.config.ts`, Xcode and `android/app/build.gradle` together), Associated Domains, App Store Connect.
- **Android Studio / JDK 21** (any OS) to build; **Google Play Console** ($25) and an upload/signing key.
- App icons and splash screens for the stores (Visual Design owns the artwork; not generated yet).
- Push in the native apps would need APNs/FCM keys (not set up; web push is separate).
