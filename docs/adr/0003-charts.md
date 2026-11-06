# ADR 0003 — Charts library

- Status: **Proposed — awaiting owner decision**
- Issue: #5 · Plan: §2.1

## Context
Plan §2.1: Victory Native XL (Skia) vs react-native-gifted-charts (SVG); "pick by measured web bundle + visual quality".
Needed chart types (§1.3): donut, bars, line (+ more in P4: area, heatmap, progress).

## Spike (what was and was not measured)
Prototype (throwaway, removed from the repo afterwards): donut + bar + line pages for both libraries, light and dark,
on `expo-router` web. Versions: `victory-native` 43.0.1 + `@shopify/react-native-skia` 2.14.0 (Expo SDK 58's bundled version)
+ reanimated 4.7.1 + worklets 0.13.0 + gesture-handler 3.3.0; `react-native-gifted-charts` 1.4.81 + `react-native-svg` 15.16.0.
Run in Chromium 152 (Claude desktop browser pane, Windows), served from the **production** `expo export`.

**Not measured: Android.** No emulator was available, so Android rendering, FPS and APK size are unverified for both libraries.
That half of the issue's acceptance criteria is still open.

| | Victory Native XL (Skia) | gifted-charts (SVG) |
|---|---|---|
| Web JS added (gzip) | ≈ 447 KB (47 KB page chunk + 400 KB lazy chunk) | ≈ 95 KB |
| Extra web asset | `canvaskit.wasm` 8.1 MB raw / **3.25 MB gzip**, lazy-loaded, must be copied to `public/` by us | none |
| Time to first paint of charts (prod, local server) | blank for ~1 s, charts by ~2 s (wasm fetch + init) | charts visible in the first screenshot (<1 s) |
| Mount-to-first-frame | 149 ms | 132 ms |
| Stress test: replace all data on every frame for 3 s | 4.7 fps, p95 frame 967 ms | 8.7 fps, p95 frame 333 ms |
| Dark mode | works (all colours from tokens) | works (inner donut circle and labels need manual colours) |
| Static export / SSR | **Crashes the Node renderer** (CanvasKit loaded during static rendering); needs a client-only gate | Works, but themed content must be client-rendered to avoid hydration mismatch |

Caveats on the numbers: single run each, the pane was not focused (rAF is throttled), and screenshots ran during the
measurement, so absolute FPS values are low and noisy; only the relative ordering is meaningful. The stress test
(re-rendering three charts every frame) is far harsher than real use. I did not test touch/hover interaction FPS.

Screenshots (web, 800×600): `assets/0003/victory-light.jpg`, `victory-dark.jpg`, `gifted-light.jpg`, `gifted-dark.jpg`.

## Observations
- **Visual quality:** Victory/Skia renders crisper, fills its container, and supports animated transitions, gradients and
  gesture-driven tooltips cheaply. Gifted charts looked less refined out of the box: fixed pixel sizes (do not fill the
  card), truncated axis labels ("J..") and heavier styling work for a polished look. Both can reach the design with effort.
- **Victory needs fonts loaded into Skia** for any axis/label text (not done in this spike, so its charts have no axis labels).
- **Dependency risk (Victory):** `victory-native` 43 declares a peer `@shopify/react-native-skia >=2.15.1`, while SDK 58 pins
  2.14.0, so it already runs outside its declared peer range. It also pulls in reanimated, worklets and gesture-handler
  (native modules; plan rule: ask before adding native/heavy deps). The reanimated/worklets pair is needed anyway for ADR 0004.
- My bar demo overlays the two series rather than grouping them in both libraries' semantics; irrelevant to the decision.

## Options
- **A. react-native-gifted-charts (SVG).** Light on web (≈95 KB gz), no wasm, static-export friendly, no extra native deps beyond `react-native-svg`.
  Risks: SVG performance on Android/web with large series (P4 calendar heatmap, 50k-point views must be aggregated), less polished defaults.
- **B. Victory Native XL (Skia).** Best visuals and interaction headroom; costs ~3.7 MB of gzip web payload (lazy), a wasm copy step,
  SSR gating, peer-range mismatch, and ongoing version-lock to Expo's Skia.

## Recommendation
**Option A (gifted-charts) for v1**, behind thin wrappers in `packages/ui` (`DonutChart`, `BarChart`, `LineChart`, …) so no screen
imports the library directly and a swap to Skia later is a contained change. The plan chose to decide by measured web bundle:
A is ~4× smaller in JS and avoids a 3 MB wasm download for a self-hosted app on a home server; the visual gap is polish work,
not a capability gap for the §1.3 chart list.
**Condition:** before accepting, someone should check Android (emulator or device) for both; if A is visibly poor or janky there,
revisit B for native-only (Skia on Android, SVG on web is possible behind the same wrappers).

## Decision
_Pending owner decision._

## Consequences (if recommendation accepted)
- P4.4 builds chart wrappers in `packages/ui` on gifted-charts; add `react-native-svg` and `expo-linear-gradient` to `apps/app`.
- Large series are aggregated before charting (day/week buckets), never plotted raw.
- No `canvaskit.wasm` handling or SSR gating needed.
