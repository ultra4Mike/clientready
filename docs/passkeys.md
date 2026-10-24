# Fingerprint / face sign-in (passkeys)

Uses Supabase Auth's built-in passkeys (supabase-js >= 2.105; installed 2.117.1). Supabase Auth issues the
challenge, checks the signature, sign counter, rpId and origin, keeps the credentials and returns a normal
session, so the app has no WebAuthn crypto, no passkeys table, and never touches the service-role key.
`@simplewebauthn` was not needed.

* Turn on: Dashboard > Authentication > Passkeys (values in /workspace/deploy27-passkeys.sql header).
  rpId `clientreadyapp.com` is permanent once people enrol.
* Rate limits: Supabase Auth's per-IP limits plus a 5-per-minute client throttle (`throttle()`).
* Session rules: passkey sign-in goes through the same `finishSignIn()` as passwords, so the
  "Keep me signed in" box, crew/owner routing and owner idle sign-out apply unchanged.
* Off / unsupported: the login button only shows when WebAuthn is available; if the dashboard switch is off
  users get "isn't switched on yet" and use the password.

## Capacitor (native app)
* The app WebView loads the live site, so the origin is https://clientreadyapp.com and it works there only if the
  WebView exposes WebAuthn: iOS WKWebView supports it from iOS 16 when the app has the Associated Domains
  entitlement `webcredentials:clientreadyapp.com` and the site serves
  `/.well-known/apple-app-site-association` listing the app's Team ID + bundle id.
* Android WebView does not support WebAuthn by itself: it needs the Credential Manager (androidx.credentials) via a
  passkey plugin, a `/.well-known/assetlinks.json` with the app's signing-cert SHA-256, and the
  `android:apk-key-hash:...` origin added to the Supabase relying-party origins (max 5 origins).
* If the WebView reports no support the button is simply hidden and password login still works.
