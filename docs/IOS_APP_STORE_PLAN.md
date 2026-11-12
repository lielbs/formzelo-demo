# Formangle on the App Store — plan

Learned from RAVO (`CODEX PROJECTS/HOMY`, read-only): its iOS app is live on App Store Connect
(signed build 1.0.0 (3) accepted on 1 Sep 2026) and was produced entirely from Windows. This plan
reuses that path and lists what is different for Formangle.

## What RAVO proved (and we reuse as is)

| Piece | RAVO | For Formangle |
| --- | --- | --- |
| Native shell | Capacitor 8 around the same Vite build (`webDir: dist`), no `server.url` (bundle shipped inside the app — App Review rejects remote-UI shells, and a bad deploy cannot brick installs) | Same |
| Build machine | GitHub Actions `macos-latest`, `workflow_dispatch` only, 45-min cap; modes `compile-check` (unsigned, no Apple account) and `archive` (signed) | Same workflow. **Formangle's repo is public, so macOS minutes are free** (RAVO's is private) |
| Signing without a Mac | CSR with OpenSSL on Windows, Apple Distribution cert in the browser, `.p12` with `-legacy`, App Store provisioning profile, all as repo secrets; temporary keychain on the runner | **Same Apple Developer team** — the existing Distribution certificate and ASC API key can be reused; only a new App ID and profile are needed. **No new cost** |
| Upload | `xcrun altool --upload-package` with the ASC API key; build number = run number | Same |
| Guards | `check-ios-release.mjs` (bundle id, shared scheme, privacy manifest, no localhost/server.url, no Expo); IPA verification (signature, entitlements, production endpoint inside the bundle, no secrets) | Port and adapt |
| Not EAS, not Xcode Cloud | EAS cannot build a Capacitor layout; Xcode Cloud needs a Mac to onboard | Same decision |
| iOS details | `contentInset: 'never'` (CSS already pays the safe area), `Keyboard.resize: 'none'`, shared `App.xcscheme` committed, `PrivacyInfo.xcprivacy`, `ITSAppUsesNonExemptEncryption=false`, camera/photo strings for image pickers, iOS 15 target | Same |

## What is different in Formangle (must be built)

1. **One production build at the root.** The web serves the demo at `/` and the production app at
   `/live/`. The app ships only the production build, built with `VITE_BASE=/`.
2. **Shareable links must not use the WebView origin.** `publicBaseUrl()` is
   `window.location.origin + BASE_PATH`; inside the app that is `capacitor://localhost`, so every
   booking link, QR code, form link and invitation would be unopenable. Native builds must use
   `https://formangle.rockstackds.com/live` (a `VITE_PUBLIC_APP_URL`, as in RAVO's `platform.ts`).
3. **Edge Functions check the browser origin** (`account-onboarding`, `operator-*` accept only
   `https://formangle.rockstackds.com`). Calls from the app would get 403. Allow the app origin
   explicitly (server-side allow-list), or keep those flows (invitation acceptance, password
   recovery, operator console) on the web and open them in Safari.
4. **Account deletion in the app (App Review 5.1.1(v)).** Formangle has no "delete my account".
   Apple requires it when an app lets people hold an account. Needs a server function with the
   owner/last-owner rules (a sole owner must close or hand over the business first).
5. **Native touches that make it an app, not a website (Guideline 4.2).** RAVO already shows the
   pattern; for Formangle: haptics on the taps and the dock (`@capacitor/haptics`), the native share
   sheet for booking/form links (`@capacitor/share`), status-bar and splash colours, and the app
   icon. Native push for new bookings/requests is the strongest argument but needs an APNs key —
   a later version, exactly as RAVO deferred it.
6. **No marketing or pricing inside the app.** The production build already redirects `/` to `/app`;
   make sure no screen links to pricing or purchase (Guideline 3.1).
7. **Review account and data.** A dedicated reviewer user in a demo business with content
   (the `impact-networks` test business already has a realistic month of Tables bookings). Created
   by the owner through the normal invitation flow — not by an assistant.

## Owner decisions and actions

| Item | Notes |
| --- | --- |
| Bundle identifier | Permanent once the App Store record exists. Proposed: `com.rockstackds.formangle` |
| App name | `Formangle` (subtitle e.g. "ניהול תהליכים והזמנות לעסק") |
| Apple Developer team | Use the existing RAVO team (no new $99) — confirm |
| App ID + profile | Create `com.rockstackds.formangle` App ID and an App Store provisioning profile (browser) |
| Secrets on `lielbs/formzelo-demo` | `APPLE_TEAM_ID`, `APPLE_DIST_CERT_P12`, `APPLE_DIST_CERT_PASSWORD`, `APPLE_PROVISIONING_PROFILE`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `ASC_APP_ID` (same commands as RAVO's runbook) |
| App Store Connect record | Name, Hebrew primary language, SKU, privacy answers, age rating, review account, support/privacy URLs (`/live/privacy`) |
| Screenshots | 6.9" from the TestFlight build on an iPhone |
| Submit | Last step, manual |

## Order of work

1. Capacitor scaffold (iOS project, config, icon, privacy manifest, Info.plist strings, shared scheme)
   + `compile-check` workflow → prove it compiles on Apple hardware (no Apple account needed).
2. Native-safe links (`VITE_PUBLIC_APP_URL`), Edge Function origin allow-list, account deletion,
   haptics and share sheet, release guards (`check:ios`).
3. Owner: App ID, profile, secrets, App Store Connect record.
4. `archive` run → signed `.ipa` verified → TestFlight.
5. Real-iPhone checklist (owner + host + guest flows, Tables shift, RTL, dark mode, keyboard,
   safe areas), screenshots, review account.
6. Submit for review.
