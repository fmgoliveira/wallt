# ADR 0006: App lock and privacy mode

Status: accepted (P2.9, #22). Dependencies approved by the owner in the P2.9 session.

## Decision

- **Privacy mode** hides every amount (`<Amount>` renders dots) on all platforms. It is one global store
  (`usePrivacyStore`), remembered between launches (`localStorage` on web, secure store on native), toggled from
  Settings and from an eye button in every page header. Any money text outside `<Amount>` must also read the store
  (the dashboard "this month" chip does). Inputs that edit a value are not masked.
- **App lock** exists on the native apps only. A 4 to 8 digit PIN is required; fingerprint/face (via
  `expo-local-authentication`) is an optional shortcut and the PIN is always the fallback
  (`disableDeviceFallback`). The web app has no lock: the browser session and device sign-in protect it.
- **Storage:** settings (on/off, timeout, biometrics), the PIN hash and the failed-attempt counter live in
  `expo-secure-store` (Android Keystore-backed). The PIN is stored as a random 128-bit salt plus an iterated SHA-256
  (`packages/core/src/lock.ts`, pure TypeScript with test vectors), never in plain text. No crypto dependency was
  added; a short PIN is weak against offline guessing whatever the hash, so the real protections are the secure
  store and the attempt lockout.
- **Lockout:** five free attempts, then refuse for 30 s doubling per further failure (cap 15 min). The counter
  survives app restarts.
- **When it locks:** cold start, and on return from the background when the time away reaches the chosen timeout
  (immediately, 1, 5 or 15 min; default 1 min). The lock screen is a full-screen cover above the app, also shown
  while the settings load so locked content never flashes.
- Turning the lock off or changing the PIN requires the current PIN.

## Not covered

- Hiding the app in the recent-apps switcher (`FLAG_SECURE`) needs a native module or a dev build; not done.
- Locking the web session; recovery if the PIN is forgotten (reinstall wipes the local data, and a synced account
  re-downloads it).
