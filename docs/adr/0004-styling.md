# ADR 0004 — Styling and animation (NativeWind + Reanimated)

- Status: **Accepted** (owner, 2026-11-06), including `expo-blur`. Android verification still outstanding; see Decision.
- Issue: #6 · Plan: §2.1, §9

## Context
One design language on Android and web, with a real desktop layout on web (§9.2: phone < 640 px bottom tabs, 640–1024 rail,
> 1024 sidebar). Plan §2.1 names NativeWind (Tailwind) + Reanimated + Moti. Need to validate responsive classes, dark mode,
animation and web hover/focus.

## Spike (what was and was not measured)
Prototype (throwaway, removed from the repo afterwards), restyled once after owner feedback ("more modern, cleaner, gradients and
glassmorphism, not overused"): a dashboard screen with a floating glass nav (bottom bar → rail → labelled sidebar), a hero
net-worth card, two stat cards with progress bars, a transactions list, a dark-mode toggle, and hover/focus styles.
Design rules used: **glass** (translucent fill + 1 px border + backdrop blur) for nav and cards; **gradient only in three places**
(hero card, logo mark, soft background glows); flat accent colour everywhere else; tabular figures for amounts.
**Reanimated** drives: staggered spring entrance, animated progress and sparkline bars, press-scale on buttons, slow drift of the
background glows, and the sync-dot pulse. Stack: `nativewind` 4.2.7 + `tailwindcss` 3.4.19 + `react-native-css-interop` 0.2.7,
`react-native-reanimated` 4.7.1 + `react-native-worklets` 0.13.0, `expo-linear-gradient` 58.0.3 (Expo-bundled), on Expo SDK 58 /
expo-router, Chromium 152 (Claude browser pane, Windows).

**Not verified: Android.** No emulator was available, so Android rendering, animation smoothness and dark mode on device are
untested. That part of the issue's acceptance criteria remains open.

| Acceptance check (web) | Result |
|---|---|
| Responsive classes switch at 640 / 1024 px | **Yes, exactly.** 639 px → bottom tabs; 640 → rail (64 px); 1023 → rail; 1024 → sidebar (224 px) and 3-column cards |
| Dark mode toggle | **Works** (`dark` class on `<html>`; all surfaces and text switch) |
| Reanimated animation | **Works:** entrance, progress/bar springs, press-scale, background drift, pulse. Visually smooth; no reliable FPS number because the pane is unfocused (frame rate throttled) |
| Hover / focus on web | **Works:** `hover:` tint on nav rows, `focus:` tint plus browser focus ring via Tab |
| Moti | **Failed on web** (see findings) |

Production web export impact: entry bundle +27 KB raw / **+7.5 KB gzip**; generated CSS 14 KB (3.3 KB gzip);
the screen chunk including Reanimated/worklets/linear-gradient is 726 KB raw / 144 KB gzip.

Screenshots (web, phone 390 / tablet 768 / desktop 1280, light + dark): `assets/0004/`.

## Findings and caveats
0. **Glass is a web-only effect for now.** `backdrop-filter` (NativeWind `backdrop-blur-*`, applied via the `web:` variant) gives real glass on web.
   On Android the same classes are expected to fall back to translucent fills with a border (no blur; not verified on device). Real blur on Android needs `expo-blur`
   (a native module, still experimental on Android); the background glows are also blurred with a CSS filter on web only (a soft
   gradient on native). `expo-blur` was approved by the owner (plan rule: ask before native dependencies); Android behaviour still to be verified in P2.1.
   Glass looks best in dark mode; in light mode it is subtle by design.
1. **Moti is not usable as-is on web.** It pulls in `framer-motion` 6.5.1 (old, 2022) and crashed Expo's Node static
   renderer (`Cannot destructure property '__extends' of 'tslib.default'`). I replaced it with Reanimated directly
   (`entering={FadeInDown…}`, `useSharedValue` / `withRepeat`), which worked. Its types also did not match Reanimated 4 transitions.
2. **pnpm strictness:** NativeWind v4 needs `react-native-css-interop` as a direct dependency of the app, otherwise Metro fails with
   `Unable to resolve "react-native-css-interop/jsx-runtime"`.
3. **`className` on Reanimated components is not mapped automatically:** needed `cssInterop(Animated.View, { className: "style" })`.
   A small `packages/ui` wrapper (`AnimatedView`) hides this.
4. **Initial dark-mode state:** with `darkMode: "class"`, the first render was light while `useColorScheme()` reported the OS scheme
   (dark). We must own the scheme (Zustand + persisted choice + `setColorScheme` on startup) rather than rely on the default.
5. **Tooling:** Biome needs `noUnknownAtRules` off for Tailwind CSS (config changed in the spike, reverted). Babel config
   (`jsxImportSource: nativewind`) and a `metro.config.js` wrapper (`withNativeWind`) are required; TypeScript needs `nativewind-env.d.ts`.
6. **Static rendering:** theme-dependent output must not rely on the pre-rendered HTML (hydration mismatch risk); pick the scheme on the client.
7. NativeWind **v5** (Tailwind 4 + `react-native-css`) is only at `5.0.0-rc.1`; not tried. I would not adopt a release candidate for the foundation.

## Options
- **A. NativeWind v4.2.7 (Tailwind 3) + Reanimated, no Moti.** Works for all checked behaviours; real CSS media queries on web
  (breakpoints exact at 640/1024), tiny runtime cost, tokens shared via the Tailwind preset (§9.1).
- **B. NativeWind v5 (Tailwind 4).** Newer, but pre-release; revisit later via a new ADR.
- **C. No Tailwind: `StyleSheet` + own tokens + `useBreakpoint()`.** Fewer moving parts and no Babel/Metro plugins, but more code per
  component and no CSS-level hover/focus/media-query ergonomics on web.

## Recommendation
**Option A, and drop Moti from the stack** (use Reanimated directly through small wrappers in `packages/ui`). Pin
`nativewind`, `tailwindcss`, `react-native-css-interop`, `react-native-reanimated`, `react-native-worklets` exact versions in ADR 0001.
**Condition:** verify on Android (emulator/device) in P2.1 before building the component library on it; if NativeWind misbehaves there,
fall back to option C behind the same `packages/ui` components.

## Decision
Owner accepted option A (NativeWind v4 + Reanimated, Moti dropped) and approved adding `expo-blur` for glass on Android. P2.1 must verify on Android (emulator or device) that NativeWind, Reanimated and `expo-blur` render and perform acceptably before the component library is built on them; if not, fall back to option C (or translucent fills without blur) behind the same `packages/ui` components and update this ADR.

## Consequences (if recommendation accepted)
- P2.1 sets up NativeWind (Babel, Metro, Tailwind preset with design tokens, `darkMode: "class"`, owned scheme store) in `apps/app`/`packages/ui`.
- Adds `nativewind`, `tailwindcss`, `react-native-css-interop`, `react-native-reanimated`, `react-native-worklets`, `expo-linear-gradient` to `apps/app`.
- `expo-blur` (Expo-bundled native module) is added for Android glass; wrap it in a `GlassSurface` component in `packages/ui` that uses `backdrop-filter` on web and `BlurView` on native, with a translucent-fill fallback.
- Biome config disables `noUnknownAtRules` for CSS.
- Plan §2.1's "Moti" is dropped; animations use Reanimated.
